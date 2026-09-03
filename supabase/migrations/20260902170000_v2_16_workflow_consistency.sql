-- V2.16 — Production Workflow Consistency & Dynamic Render Repair

-- Campaign + queue item creation is one transaction. The browser can no longer
-- leave an orphan campaign when an item insert fails midway through creation.
CREATE OR REPLACE FUNCTION public.create_campaign_with_items(p_campaign jsonb, p_items jsonb)
RETURNS TABLE(campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign uuid;
  v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'items must be an array'; END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 5000 THEN RAISE EXCEPTION 'campaign must contain 1-5000 items'; END IF;

  INSERT INTO public.campaigns(
    user_id, youtube_connection_id, name, template_id, status, timezone,
    total_videos, settings_json
  ) VALUES (
    v_user,
    NULLIF(p_campaign->>'youtube_connection_id','')::uuid,
    btrim(p_campaign->>'name'),
    (p_campaign->>'template_id')::uuid,
    COALESCE(NULLIF(p_campaign->>'status','')::public.campaign_status, 'draft'::public.campaign_status),
    COALESCE(NULLIF(p_campaign->>'timezone',''), 'UTC'),
    v_count,
    COALESCE(p_campaign->'settings_json','{}'::jsonb)
  ) RETURNING id INTO v_campaign;

  INSERT INTO public.campaign_items(
    campaign_id,user_id,video_file_name,content_json,seo_json,youtube_settings_json,
    audio_json,asset_json,status,schedule_at
  )
  SELECT
    v_campaign,
    v_user,
    COALESCE(NULLIF(i->>'video_file_name',''), 'video-' || substr(gen_random_uuid()::text,1,8) || '.mp4'),
    COALESCE(i->'content_json','{}'::jsonb),
    COALESCE(i->'seo_json','{}'::jsonb),
    COALESCE(i->'youtube_settings_json','{}'::jsonb),
    COALESCE(i->'audio_json','{}'::jsonb),
    COALESCE(i->'asset_json','{}'::jsonb),
    'pending'::public.item_status,
    CASE WHEN NULLIF(i->>'schedule_at','') IS NULL THEN NULL ELSE (i->>'schedule_at')::timestamptz END
  FROM jsonb_array_elements(p_items) AS q(i);

  RETURN QUERY SELECT v_campaign;
END;
$$;
REVOKE ALL ON FUNCTION public.create_campaign_with_items(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_with_items(jsonb,jsonb) TO authenticated;

-- Preserve the intended remote state in immutable upload attempts. This makes
-- crash recovery distinguish a future scheduled upload from an immediate one.
ALTER TABLE public.upload_attempts
  ADD COLUMN IF NOT EXISTS intended_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS intended_final_status text CHECK (intended_final_status IS NULL OR intended_final_status IN ('uploaded','scheduled'));

CREATE OR REPLACE FUNCTION public.claim_upload_item(
  p_item_id uuid,
  p_worker_id text,
  p_idempotency_key text
) RETURNS TABLE(attempt_id uuid, user_id uuid, campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.campaign_items%ROWTYPE;
  v_attempt uuid;
  v_existing public.upload_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.upload_attempts
  WHERE campaign_item_id = p_item_id AND youtube_video_id IS NOT NULL
  ORDER BY claimed_at DESC LIMIT 1;
  IF v_existing.youtube_video_id IS NOT NULL THEN
    UPDATE public.campaign_items
    SET status=CASE WHEN v_existing.intended_final_status='scheduled' THEN 'scheduled'::public.item_status ELSE 'uploaded'::public.item_status END,
        youtube_video_id=v_existing.youtube_video_id,
        youtube_publish_at=v_existing.intended_publish_at,
        youtube_url='https://youtube.com/shorts/' || v_existing.youtube_video_id,
        active_upload_attempt_id=NULL, error_message=NULL
    WHERE id=p_item_id AND youtube_video_id IS NULL;
    RETURN;
  END IF;

  SELECT * INTO v_item FROM public.campaign_items
  WHERE id = p_item_id
    AND status IN ('pending','rendered','upload_pending')
    AND rendered_video_url IS NOT NULL
    AND active_upload_attempt_id IS NULL
    AND youtube_video_id IS NULL
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.upload_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;

  UPDATE public.campaign_items SET status='uploading', error_message=NULL, active_upload_attempt_id=v_attempt WHERE id=v_item.id;
  RETURN QUERY SELECT v_attempt, v_item.user_id, v_item.campaign_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_upload_item(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upload_item(uuid,text,text) TO service_role;

-- Active campaigns complete only after every queue item reached a terminal
-- uploaded state. Scheduled videos remain active until YouTube confirms public.
CREATE OR REPLACE FUNCTION public.complete_finished_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.campaigns c
  SET status='completed', updated_at=now()
  WHERE c.status='active'
    AND EXISTS (SELECT 1 FROM public.campaign_items ci WHERE ci.campaign_id=c.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_items ci
      WHERE ci.campaign_id=c.id AND ci.status <> 'uploaded'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_finished_campaigns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_finished_campaigns() TO service_role;

-- An active automation campaign must be executable. Drafts may be created
-- without a channel/schedule so users can finish setup later.
CREATE OR REPLACE FUNCTION public.assert_campaign_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.youtube_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.youtube_connections yc WHERE yc.id=NEW.youtube_connection_id AND yc.user_id=NEW.user_id AND yc.is_connected=true
  ) THEN RAISE EXCEPTION 'youtube connection does not belong to campaign owner' USING ERRCODE='23514'; END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.templates t WHERE t.id=NEW.template_id AND (t.user_id=NEW.user_id OR t.is_default=true)
  ) THEN RAISE EXCEPTION 'template is not available to campaign owner' USING ERRCODE='23514'; END IF;
  IF NEW.status='active' THEN
    IF NEW.youtube_connection_id IS NULL THEN RAISE EXCEPTION 'connect a YouTube channel before activating the campaign' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.campaign_items ci WHERE ci.campaign_id=NEW.id) THEN RAISE EXCEPTION 'campaign has no videos to automate' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.campaign_items ci WHERE ci.campaign_id=NEW.id AND ci.schedule_at IS NULL) THEN
      RAISE EXCEPTION 'schedule every campaign item before activating automation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_campaign_tenant_integrity ON public.campaigns;
CREATE TRIGGER trg_campaign_tenant_integrity
BEFORE INSERT OR UPDATE OF user_id, youtube_connection_id, template_id, status ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.assert_campaign_tenant_integrity();
