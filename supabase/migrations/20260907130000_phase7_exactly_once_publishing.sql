-- Phase 7 — Durable scheduler + exactly-once YouTube publishing queue.

CREATE TABLE IF NOT EXISTS public.publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_item_id uuid NOT NULL UNIQUE REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','uploading','retry_wait','completed','failed','cancelled')),
  intended_publish_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  upload_session_url text,
  upload_offset bigint NOT NULL DEFAULT 0,
  upload_length bigint,
  youtube_video_id text,
  last_error text,
  quota_error boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_ready ON public.publish_jobs(status,next_attempt_at,created_at)
  WHERE status IN ('pending','retry_wait');
CREATE INDEX IF NOT EXISTS idx_publish_jobs_lease ON public.publish_jobs(lease_expires_at)
  WHERE status IN ('leased','uploading');
ALTER TABLE public.publish_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.publish_jobs TO authenticated;
GRANT ALL ON public.publish_jobs TO service_role;
DROP POLICY IF EXISTS "users select own publish jobs" ON public.publish_jobs;
CREATE POLICY "users select own publish jobs" ON public.publish_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  render_candidates integer NOT NULL DEFAULT 0,
  publish_candidates integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.scheduler_runs TO service_role;

-- Durable lead-time materialization. Existing campaign_items are the immutable
-- content rows; this function converts their schedule into dispatch deadlines.
CREATE OR REPLACE FUNCTION public.dispatch_upcoming_campaign_items(p_horizon_minutes integer DEFAULT 1440)
RETURNS TABLE(render_candidates integer, publish_candidates integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_render integer := 0; v_publish integer := 0;
BEGIN
  UPDATE public.campaign_items ci
     SET render_due_at = COALESCE(ci.render_due_at, ci.schedule_at - interval '60 minutes'),
         upload_due_at = COALESCE(ci.upload_due_at, ci.schedule_at - interval '20 minutes')
    FROM public.campaigns c
   WHERE c.id=ci.campaign_id AND c.status='active' AND ci.is_paused=false
     AND ci.schedule_at IS NOT NULL
     AND ci.schedule_at <= now() + make_interval(mins => GREATEST(1,p_horizon_minutes));
  GET DIAGNOSTICS v_render = ROW_COUNT;

  INSERT INTO public.publish_jobs(campaign_item_id,campaign_id,user_id,intended_publish_at,next_attempt_at)
  SELECT ci.id,ci.campaign_id,ci.user_id,
         CASE WHEN ci.schedule_at > now()+interval '1 minute' THEN ci.schedule_at ELSE NULL END,
         GREATEST(COALESCE(ci.upload_due_at,now()),now())
    FROM public.campaign_items ci JOIN public.campaigns c ON c.id=ci.campaign_id
   WHERE c.status='active' AND ci.is_paused=false
     AND ci.rendered_video_url IS NOT NULL AND ci.youtube_video_id IS NULL
     AND COALESCE(ci.upload_due_at,ci.schedule_at,now()) <= now()+interval '5 minutes'
  ON CONFLICT (campaign_item_id) DO UPDATE
    SET intended_publish_at=EXCLUDED.intended_publish_at,
        updated_at=now()
    WHERE public.publish_jobs.status NOT IN ('completed','cancelled');
  GET DIAGNOSTICS v_publish = ROW_COUNT;
  RETURN QUERY SELECT v_render,v_publish;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_upcoming_campaign_items(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_upcoming_campaign_items(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_publish_jobs(p_worker_id text,p_limit integer DEFAULT 2,p_lease_seconds integer DEFAULT 90)
RETURNS SETOF public.publish_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT pj.id FROM public.publish_jobs pj
     WHERE pj.status IN ('pending','retry_wait') AND pj.next_attempt_at<=now()
       AND pj.youtube_video_id IS NULL
     ORDER BY pj.next_attempt_at,pj.created_at
     FOR UPDATE SKIP LOCKED LIMIT GREATEST(1,LEAST(p_limit,20))
  ), updated AS (
    UPDATE public.publish_jobs pj SET
      status='leased', lease_owner=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>GREATEST(30,p_lease_seconds)),
      heartbeat_at=now(), attempt_count=pj.attempt_count+1, updated_at=now()
    FROM picked WHERE pj.id=picked.id RETURNING pj.*
  ) SELECT * FROM updated;
END $$;
REVOKE ALL ON FUNCTION public.claim_publish_jobs(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_jobs(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_publish_job(p_job_id uuid,p_worker_id text,p_lease_seconds integer DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.publish_jobs SET heartbeat_at=now(),lease_expires_at=now()+make_interval(secs=>GREATEST(30,p_lease_seconds)),updated_at=now()
 WHERE id=p_job_id AND lease_owner=p_worker_id AND status IN ('leased','uploading');
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.heartbeat_publish_job(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_publish_job(uuid,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_stale_publish_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.publish_jobs SET status='retry_wait',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
   next_attempt_at=now()+interval '15 seconds',last_error=COALESCE(last_error,'Worker lease expired'),updated_at=now()
 WHERE status IN ('leased','uploading') AND lease_expires_at<now() AND youtube_video_id IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_stale_publish_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_publish_jobs() TO service_role;

-- Reuses one logical upload attempt for the lifetime of a campaign item. This
-- lets a restarted publisher continue the same YouTube resumable session.
CREATE OR REPLACE FUNCTION public.claim_exact_upload_attempt(p_item_id uuid,p_worker_id text,p_idempotency_key text)
RETURNS TABLE(attempt_id uuid,user_id uuid,campaign_id uuid,youtube_video_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.campaign_items%ROWTYPE; v_attempt public.upload_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.campaign_items WHERE id=p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.rendered_video_url IS NULL THEN RETURN; END IF;
  IF v_item.youtube_video_id IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid,v_item.user_id,v_item.campaign_id,v_item.youtube_video_id; RETURN;
  END IF;

  SELECT * INTO v_attempt FROM public.upload_attempts WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_attempt.youtube_video_id IS NOT NULL THEN
      UPDATE public.campaign_items SET youtube_video_id=v_attempt.youtube_video_id,
        youtube_url='https://youtube.com/shorts/'||v_attempt.youtube_video_id,
        status=CASE WHEN v_attempt.intended_publish_at IS NULL THEN 'uploaded' ELSE 'scheduled' END,
        youtube_publish_at=v_attempt.intended_publish_at,active_upload_attempt_id=NULL,error_message=NULL
      WHERE id=p_item_id AND youtube_video_id IS NULL;
      RETURN QUERY SELECT v_attempt.id,v_item.user_id,v_item.campaign_id,v_attempt.youtube_video_id; RETURN;
    END IF;
    UPDATE public.upload_attempts SET status='claimed',worker_id=p_worker_id,error_message=NULL,finished_at=NULL WHERE id=v_attempt.id;
    UPDATE public.campaign_items SET status='uploading',active_upload_attempt_id=v_attempt.id,error_message=NULL WHERE id=p_item_id;
    RETURN QUERY SELECT v_attempt.id,v_item.user_id,v_item.campaign_id,NULL::text; RETURN;
  END IF;

  INSERT INTO public.upload_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id)
  RETURNING * INTO v_attempt;
  UPDATE public.campaign_items SET status='uploading',active_upload_attempt_id=v_attempt.id,error_message=NULL WHERE id=p_item_id;
  RETURN QUERY SELECT v_attempt.id,v_item.user_id,v_item.campaign_id,NULL::text;
END $$;
REVOKE ALL ON FUNCTION public.claim_exact_upload_attempt(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_exact_upload_attempt(uuid,text,text) TO service_role;
