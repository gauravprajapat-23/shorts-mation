-- V2.15 — Queue Control Center & State Integrity Repair

-- Queue lifecycle columns are worker-owned. Authenticated clients may create
-- their own campaign rows and read/delete them, but all UPDATEs go through
-- explicit SECURITY DEFINER queue commands below.
REVOKE UPDATE, DELETE ON public.campaign_items FROM authenticated;
DROP POLICY IF EXISTS "users manage own items" ON public.campaign_items;
DROP POLICY IF EXISTS "users select own items" ON public.campaign_items;
DROP POLICY IF EXISTS "users insert own items" ON public.campaign_items;
DROP POLICY IF EXISTS "users delete own items" ON public.campaign_items;
CREATE POLICY "users select own items" ON public.campaign_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own items" ON public.campaign_items
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND rendered_video_url IS NULL
    AND youtube_video_id IS NULL
    AND youtube_url IS NULL
    AND error_message IS NULL
    AND retry_count = 0
  );

-- Retry is stage-aware and refuses to race an active render/upload attempt.
CREATE OR REPLACE FUNCTION public.retry_campaign_item(p_item_id uuid)
RETURNS TABLE(item_id uuid, retry_stage text, retry_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.campaign_items%ROWTYPE;
  v_stage text;
BEGIN
  SELECT * INTO v_item
  FROM public.campaign_items
  WHERE id = p_item_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign item not found' USING ERRCODE='P0002'; END IF;
  IF v_item.status <> 'failed' THEN RAISE EXCEPTION 'only failed items can be retried'; END IF;
  -- If a rendered MP4 already exists, retry the upload only. Otherwise retry render.
  IF v_item.rendered_video_url IS NOT NULL THEN
    v_stage := 'upload';
    UPDATE public.campaign_items
      SET status='rendered', error_message=NULL, retry_count=retry_count+1,
          upload_due_at=LEAST(COALESCE(upload_due_at, now()), now())
      WHERE id=v_item.id;
  ELSE
    v_stage := 'render';
    UPDATE public.campaign_items
      SET status='pending', error_message=NULL, retry_count=retry_count+1,
          render_job_ref=NULL, render_submitted_at=NULL,
          render_due_at=LEAST(COALESCE(render_due_at, now()), now())
      WHERE id=v_item.id;
  END IF;

  INSERT INTO public.automation_logs(user_id,campaign_id,campaign_item_id,level,message,metadata_json)
  VALUES(v_item.user_id,v_item.campaign_id,v_item.id,'info',
    'Manual retry requested for ' || v_stage,
    jsonb_build_object('retry_stage',v_stage,'previous_status',v_item.status));

  RETURN QUERY SELECT v_item.id, v_stage, v_item.retry_count + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_campaign_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_campaign_item(uuid) TO authenticated, service_role;

-- Atomically validate and apply bulk schedule/privacy edits for rows that have
-- not reached YouTube. Scheduled/uploading/uploaded rows must use the remote
-- synchronization command so DB state can never diverge from YouTube state.
CREATE OR REPLACE FUNCTION public.bulk_update_queue_items(p_campaign_id uuid, p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_rec record;
  v_schedule timestamptz;
  v_privacy text;
  v_rows integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id=p_campaign_id AND user_id=v_user) THEN
    RAISE EXCEPTION 'campaign not found' USING ERRCODE='P0002';
  END IF;
  IF jsonb_typeof(p_updates) <> 'array' THEN RAISE EXCEPTION 'updates must be an array'; END IF;

  -- Lock and validate every requested row before mutating any row.
  FOR v_rec IN
    SELECT ci.id, ci.status, u.value AS patch
    FROM jsonb_array_elements(p_updates) u(value)
    JOIN public.campaign_items ci ON ci.id=(u.value->>'id')::uuid
    WHERE ci.campaign_id=p_campaign_id AND ci.user_id=v_user
    FOR UPDATE OF ci
  LOOP
    IF v_rec.status IN ('uploading','scheduled','uploaded') THEN
      RAISE EXCEPTION 'item % is remote-bound (%); use YouTube reschedule instead', v_rec.id, v_rec.status;
    END IF;
    IF (v_rec.patch ? 'privacy') AND COALESCE(v_rec.patch->>'privacy','') NOT IN ('private','unlisted','public','') THEN
      RAISE EXCEPTION 'invalid privacy value for item %', v_rec.id;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM jsonb_array_elements(p_updates)) <> (
    SELECT count(*) FROM jsonb_array_elements(p_updates) u
    JOIN public.campaign_items ci ON ci.id=(u.value->>'id')::uuid
    WHERE ci.campaign_id=p_campaign_id AND ci.user_id=v_user
  ) THEN
    RAISE EXCEPTION 'one or more queue items are not part of this campaign';
  END IF;

  FOR v_rec IN SELECT value AS patch FROM jsonb_array_elements(p_updates)
  LOOP
    v_schedule := CASE WHEN v_rec.patch ? 'schedule_at' AND v_rec.patch->>'schedule_at' IS NOT NULL
      THEN (v_rec.patch->>'schedule_at')::timestamptz ELSE NULL END;
    v_privacy := NULLIF(v_rec.patch->>'privacy','');
    UPDATE public.campaign_items
      SET schedule_at = v_schedule,
          youtube_settings_json = CASE WHEN v_privacy IS NULL THEN youtube_settings_json
            ELSE jsonb_set(COALESCE(youtube_settings_json,'{}'::jsonb),'{privacy}',to_jsonb(v_privacy),true) END
      WHERE id=(v_rec.patch->>'id')::uuid AND campaign_id=p_campaign_id AND user_id=v_user;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.bulk_update_queue_items(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_queue_items(uuid,jsonb) TO authenticated, service_role;