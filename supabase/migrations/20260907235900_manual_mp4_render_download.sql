-- Manual MP4 generation intentionally bypasses campaign pause state without
-- weakening the automation claim contract. Service role only.
CREATE OR REPLACE FUNCTION public.claim_render_item_manual(
  p_item_id uuid,
  p_worker_id text,
  p_idempotency_key text
)
RETURNS TABLE(attempt_id uuid,user_id uuid,campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_item public.campaign_items%ROWTYPE;
  v_attempt uuid;
BEGIN
  SELECT * INTO v_item
  FROM public.campaign_items
  WHERE id=p_item_id
    AND status IN ('pending','upload_pending')
    AND rendered_video_url IS NULL
    AND active_render_attempt_id IS NULL
    AND render_dead_lettered_at IS NULL
    AND render_cancel_requested_at IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.render_attempts(
    campaign_item_id,user_id,campaign_id,idempotency_key,worker_id,provider,retry_number,provider_status
  )
  VALUES(
    v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id,'ffmpeg-worker',v_item.render_retry_count,'queued'
  )
  ON CONFLICT(idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt;

  IF v_attempt IS NULL THEN RETURN; END IF;

  UPDATE public.campaign_items
  SET status='rendering',error_message=NULL,render_provider='ffmpeg-worker',render_submitted_at=now(),active_render_attempt_id=v_attempt
  WHERE id=v_item.id;

  RETURN QUERY SELECT v_attempt,v_item.user_id,v_item.campaign_id;
END
$$;

REVOKE ALL ON FUNCTION public.claim_render_item_manual(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_item_manual(uuid,text,text) TO service_role;
