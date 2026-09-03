-- V2.19 — Campaign Operations 2.0
ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text;

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign_paused_schedule
ON public.campaign_items(campaign_id, is_paused, schedule_at);

CREATE OR REPLACE FUNCTION public.set_campaign_item_paused(p_item_id uuid, p_paused boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.campaign_items%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.campaign_items WHERE id=p_item_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign item not found'; END IF;
  IF v.status IN ('uploading','scheduled','uploaded') THEN
    RAISE EXCEPTION 'video can no longer be paused after YouTube upload has started';
  END IF;
  UPDATE public.campaign_items
  SET is_paused=p_paused,
      paused_at=CASE WHEN p_paused THEN now() ELSE NULL END,
      paused_reason=CASE WHEN p_paused THEN 'paused by operator' ELSE NULL END
  WHERE id=p_item_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_campaign_item_paused(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_item_paused(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_selected_campaign_items(p_campaign_id uuid, p_item_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_count integer := 0; v_stage text; v_retry integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id=p_campaign_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'campaign not found'; END IF;
  FOREACH v_id IN ARRAY p_item_ids LOOP
    IF EXISTS (SELECT 1 FROM public.campaign_items WHERE id=v_id AND campaign_id=p_campaign_id AND user_id=auth.uid() AND status='failed') THEN
      SELECT retry_stage,retry_count INTO v_stage,v_retry FROM public.retry_campaign_item(v_id) LIMIT 1;
      IF v_stage IS NOT NULL THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.retry_selected_campaign_items(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_selected_campaign_items(uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.duplicate_campaign(p_campaign_id uuid, p_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid(); v_source public.campaigns%ROWTYPE; v_new uuid;
BEGIN
  SELECT * INTO v_source FROM public.campaigns WHERE id=p_campaign_id AND user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found'; END IF;
  INSERT INTO public.campaigns(user_id,youtube_connection_id,name,template_id,status,timezone,total_videos,settings_json)
  VALUES(v_user,v_source.youtube_connection_id,COALESCE(NULLIF(btrim(p_name),''),v_source.name || ' Copy'),v_source.template_id,'draft',v_source.timezone,v_source.total_videos,v_source.settings_json)
  RETURNING id INTO v_new;
  INSERT INTO public.campaign_items(campaign_id,user_id,video_file_name,content_json,seo_json,youtube_settings_json,audio_json,asset_json,status,schedule_at,render_priority,is_paused)
  SELECT v_new,v_user,video_file_name,content_json,seo_json,youtube_settings_json,audio_json,asset_json,'pending',schedule_at,render_priority,false
  FROM public.campaign_items WHERE campaign_id=p_campaign_id ORDER BY created_at;
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.duplicate_campaign(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_campaign(uuid,text) TO authenticated;

-- Paused rows are intentionally excluded from both provider claim boundaries.
CREATE OR REPLACE FUNCTION public.claim_render_item(p_item_id uuid,p_worker_id text,p_idempotency_key text)
RETURNS TABLE(attempt_id uuid,user_id uuid,campaign_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.campaign_items%ROWTYPE; v_attempt uuid;
BEGIN
  SELECT * INTO v_item FROM public.campaign_items
  WHERE id=p_item_id AND status IN ('pending','upload_pending') AND rendered_video_url IS NULL
    AND active_render_attempt_id IS NULL AND is_paused=false AND render_dead_lettered_at IS NULL
    AND render_cancel_requested_at IS NULL
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.render_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id,retry_number)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id,v_item.render_retry_count)
  ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;
  UPDATE public.campaign_items SET status='rendering',error_message=NULL,render_provider='shotstack',render_submitted_at=now(),active_render_attempt_id=v_attempt WHERE id=v_item.id;
  RETURN QUERY SELECT v_attempt,v_item.user_id,v_item.campaign_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_render_item(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_item(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_upload_item(p_item_id uuid,p_worker_id text,p_idempotency_key text)
RETURNS TABLE(attempt_id uuid,user_id uuid,campaign_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.campaign_items%ROWTYPE; v_attempt uuid; v_existing public.upload_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.upload_attempts WHERE campaign_item_id=p_item_id AND youtube_video_id IS NOT NULL ORDER BY claimed_at DESC LIMIT 1;
  IF v_existing.youtube_video_id IS NOT NULL THEN
    UPDATE public.campaign_items SET status=CASE WHEN v_existing.intended_final_status='scheduled' THEN 'scheduled'::public.item_status ELSE 'uploaded'::public.item_status END,
      youtube_video_id=v_existing.youtube_video_id,youtube_publish_at=v_existing.intended_publish_at,youtube_url='https://youtube.com/shorts/'||v_existing.youtube_video_id,
      active_upload_attempt_id=NULL,error_message=NULL
    WHERE id=p_item_id AND youtube_video_id IS NULL;
    RETURN;
  END IF;
  SELECT * INTO v_item FROM public.campaign_items
  WHERE id=p_item_id AND status IN ('pending','rendered','upload_pending') AND rendered_video_url IS NOT NULL
    AND active_upload_attempt_id IS NULL AND youtube_video_id IS NULL AND is_paused=false
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.upload_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id)
  ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;
  UPDATE public.campaign_items SET status='uploading',error_message=NULL,active_upload_attempt_id=v_attempt WHERE id=v_item.id;
  RETURN QUERY SELECT v_attempt,v_item.user_id,v_item.campaign_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_upload_item(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upload_item(uuid,text,text) TO service_role;
