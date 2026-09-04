-- Native FFmpeg worker provider/state. Secrets remain service-role only.
ALTER TABLE public.render_providers
  ADD COLUMN IF NOT EXISTS worker_url text,
  ADD COLUMN IF NOT EXISTS worker_secret_encrypted text;
ALTER TABLE public.render_attempts
  ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz;

-- The newest claim function is the authoritative provider assignment boundary.
CREATE OR REPLACE FUNCTION public.claim_render_item(p_item_id uuid,p_worker_id text,p_idempotency_key text)
RETURNS TABLE(attempt_id uuid,user_id uuid,campaign_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.campaign_items%ROWTYPE; v_attempt uuid;
BEGIN
  SELECT * INTO v_item FROM public.campaign_items WHERE id=p_item_id AND status IN ('pending','upload_pending') AND rendered_video_url IS NULL
    AND active_render_attempt_id IS NULL AND is_paused=false AND render_dead_lettered_at IS NULL AND render_cancel_requested_at IS NULL
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.render_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id,provider,retry_number,provider_status)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id,'ffmpeg-worker',v_item.render_retry_count,'queued')
  ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;
  UPDATE public.campaign_items SET status='rendering',error_message=NULL,render_provider='ffmpeg-worker',render_submitted_at=now(),active_render_attempt_id=v_attempt WHERE id=v_item.id;
  RETURN QUERY SELECT v_attempt,v_item.user_id,v_item.campaign_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_render_item(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_item(uuid,text,text) TO service_role;

-- Existing rows migrate in-place; no Shotstack credential remains active.
UPDATE public.render_providers
SET provider='ffmpeg-worker', api_key_encrypted=NULL, env='native', verified_at=NULL,
    last_error=CASE WHEN worker_url IS NULL THEN 'Configure the native FFmpeg worker URL and secret.' ELSE last_error END
WHERE provider<>'ffmpeg-worker';
