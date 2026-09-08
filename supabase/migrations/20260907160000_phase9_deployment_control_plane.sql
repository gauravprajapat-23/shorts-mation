-- Phase 9 — Deployment control plane, autoscaling recommendations, admission control.
CREATE TABLE IF NOT EXISTS public.control_plane_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  render_min_replicas integer NOT NULL DEFAULT 1,
  render_max_replicas integer NOT NULL DEFAULT 12,
  render_target_queued_per_replica integer NOT NULL DEFAULT 4,
  render_max_queued integer NOT NULL DEFAULT 200,
  render_scale_age_seconds integer NOT NULL DEFAULT 120,
  publisher_min_replicas integer NOT NULL DEFAULT 1,
  publisher_max_replicas integer NOT NULL DEFAULT 8,
  publisher_target_queued_per_replica integer NOT NULL DEFAULT 3,
  publisher_max_queued integer NOT NULL DEFAULT 100,
  publisher_scale_age_seconds integer NOT NULL DEFAULT 120,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (render_min_replicas >= 0 AND render_max_replicas >= render_min_replicas),
  CHECK (publisher_min_replicas >= 0 AND publisher_max_replicas >= publisher_min_replicas),
  CHECK (render_target_queued_per_replica > 0 AND publisher_target_queued_per_replica > 0),
  CHECK (render_max_queued > 0 AND publisher_max_queued > 0)
);
INSERT INTO public.control_plane_settings(id) VALUES(true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.control_plane_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.control_plane_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.production_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_sha text NOT NULL,
  environment text NOT NULL DEFAULT 'staging',
  campaign_item_id uuid REFERENCES public.campaign_items(id) ON DELETE SET NULL,
  youtube_video_id text,
  status text NOT NULL CHECK (status IN ('running','passed','failed')),
  csv_to_render boolean NOT NULL DEFAULT false,
  r2_output_ready boolean NOT NULL DEFAULT false,
  youtube_upload_complete boolean NOT NULL DEFAULT false,
  youtube_public_verified boolean NOT NULL DEFAULT false,
  crash_matrix_passed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_production_certifications_release ON public.production_certifications(release_sha,environment,started_at DESC);
ALTER TABLE public.production_certifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.production_certifications TO service_role;

CREATE OR REPLACE FUNCTION public.phase9_control_plane_health(p_stale_seconds integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cfg public.control_plane_settings%ROWTYPE;
  render_queued bigint := 0; render_active bigint := 0; render_failed bigint := 0; render_nodes bigint := 0; render_capacity bigint := 0;
  render_oldest_seconds integer := 0;
  publish_queued bigint := 0; publish_active bigint := 0; publish_failed bigint := 0; publish_nodes bigint := 0; publish_capacity bigint := 0;
  publish_oldest_seconds integer := 0;
  render_desired integer; publisher_desired integer;
  render_admit boolean; publisher_admit boolean;
  render_exists boolean := to_regclass('public.render_queue_jobs') IS NOT NULL;
  nodes_exists boolean := to_regclass('public.render_worker_nodes') IS NOT NULL;
BEGIN
  SELECT * INTO cfg FROM public.control_plane_settings WHERE id=true;
  IF cfg.id IS NULL THEN INSERT INTO public.control_plane_settings(id) VALUES(true) RETURNING * INTO cfg; END IF;

  IF render_exists THEN
    EXECUTE 'SELECT count(*) FROM public.render_queue_jobs WHERE status IN (''queued'',''retry_wait'')' INTO render_queued;
    EXECUTE 'SELECT count(*) FROM public.render_queue_jobs WHERE status IN (''leased'',''rendering'',''encoding'',''uploading'')' INTO render_active;
    EXECUTE 'SELECT count(*) FROM public.render_queue_jobs WHERE status=''failed''' INTO render_failed;
    EXECUTE 'SELECT COALESCE(EXTRACT(EPOCH FROM (now()-min(created_at)))::integer,0) FROM public.render_queue_jobs WHERE status IN (''queued'',''retry_wait'')' INTO render_oldest_seconds;
  END IF;
  IF nodes_exists THEN
    EXECUTE format('UPDATE public.render_worker_nodes SET status=''offline'' WHERE status<>''offline'' AND last_heartbeat_at < now()-make_interval(secs=>%s)', GREATEST(10,p_stale_seconds));
    EXECUTE 'SELECT count(*),COALESCE(sum(max_concurrency),0) FROM public.render_worker_nodes WHERE status=''active''' INTO render_nodes,render_capacity;
  END IF;

  UPDATE public.publisher_nodes SET status='offline' WHERE status<>'offline' AND last_heartbeat_at < now()-make_interval(secs=>GREATEST(10,p_stale_seconds));
  SELECT count(*) INTO publish_queued FROM public.publish_jobs WHERE status IN ('pending','retry_wait');
  SELECT count(*) INTO publish_active FROM public.publish_jobs WHERE status IN ('leased','uploading');
  SELECT count(*) INTO publish_failed FROM public.publish_jobs WHERE status='failed';
  SELECT COALESCE(EXTRACT(EPOCH FROM (now()-min(COALESCE(next_attempt_at,created_at))))::integer,0) INTO publish_oldest_seconds FROM public.publish_jobs WHERE status IN ('pending','retry_wait');
  SELECT count(*),COALESCE(sum(max_concurrency),0) INTO publish_nodes,publish_capacity FROM public.publisher_nodes WHERE status='active';

  render_desired := LEAST(cfg.render_max_replicas, GREATEST(cfg.render_min_replicas,
    CEIL(render_queued::numeric / cfg.render_target_queued_per_replica)::integer + CASE WHEN render_oldest_seconds >= cfg.render_scale_age_seconds AND render_queued > 0 THEN 1 ELSE 0 END));
  publisher_desired := LEAST(cfg.publisher_max_replicas, GREATEST(cfg.publisher_min_replicas,
    CEIL(publish_queued::numeric / cfg.publisher_target_queued_per_replica)::integer + CASE WHEN publish_oldest_seconds >= cfg.publisher_scale_age_seconds AND publish_queued > 0 THEN 1 ELSE 0 END));
  render_admit := render_queued < cfg.render_max_queued;
  publisher_admit := publish_queued < cfg.publisher_max_queued;

  RETURN jsonb_build_object(
    'generatedAt',now(),
    'render',jsonb_build_object('queued',render_queued,'active',render_active,'failed',render_failed,'oldestQueuedSeconds',render_oldest_seconds,'activeNodes',render_nodes,'activeCapacity',render_capacity,'desiredReplicas',render_desired,'minReplicas',cfg.render_min_replicas,'maxReplicas',cfg.render_max_replicas,'admit',render_admit,'maxQueued',cfg.render_max_queued),
    'publisher',jsonb_build_object('queued',publish_queued,'active',publish_active,'failed',publish_failed,'oldestQueuedSeconds',publish_oldest_seconds,'activeNodes',publish_nodes,'activeCapacity',publish_capacity,'desiredReplicas',publisher_desired,'minReplicas',cfg.publisher_min_replicas,'maxReplicas',cfg.publisher_max_replicas,'admit',publisher_admit,'maxQueued',cfg.publisher_max_queued),
    'scheduler',jsonb_build_object('recentRuns',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.started_at DESC) FROM (SELECT id,worker_id,started_at,finished_at,render_candidates,publish_candidates,metadata_json FROM public.scheduler_runs ORDER BY started_at DESC LIMIT 10) s),'[]'::jsonb)),
    'certification',COALESCE((SELECT to_jsonb(c) FROM public.production_certifications c ORDER BY started_at DESC LIMIT 1),'null'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.phase9_control_plane_health(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase9_control_plane_health(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.phase9_record_certification(
  p_release_sha text,p_status text,p_campaign_item_id uuid DEFAULT NULL,p_youtube_video_id text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb,
  p_csv boolean DEFAULT false,p_r2 boolean DEFAULT false,p_upload boolean DEFAULT false,p_public boolean DEFAULT false,p_crash boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  INSERT INTO public.production_certifications(release_sha,status,campaign_item_id,youtube_video_id,csv_to_render,r2_output_ready,youtube_upload_complete,youtube_public_verified,crash_matrix_passed,finished_at,metadata_json)
  VALUES(p_release_sha,p_status,p_campaign_item_id,p_youtube_video_id,p_csv,p_r2,p_upload,p_public,p_crash,CASE WHEN p_status IN ('passed','failed') THEN now() ELSE NULL END,COALESCE(p_metadata,'{}'::jsonb)) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.phase9_record_certification(text,text,uuid,text,jsonb,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase9_record_certification(text,text,uuid,text,jsonb,boolean,boolean,boolean,boolean,boolean) TO service_role;

-- Phase 9 crash-drill repair: a publish job with an already committed YouTube
-- video id must still be reclaimable so a new publisher can finish the local
-- campaign transaction after a process dies at youtube_committed/campaign_committed.
CREATE OR REPLACE FUNCTION public.claim_publish_jobs(p_worker_id text,p_limit integer DEFAULT 2,p_lease_seconds integer DEFAULT 90)
RETURNS SETOF public.publish_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT pj.id FROM public.publish_jobs pj
     WHERE pj.status IN ('pending','retry_wait') AND pj.next_attempt_at<=now()
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

CREATE OR REPLACE FUNCTION public.reconcile_stale_publish_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.publish_jobs SET status='retry_wait',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
   next_attempt_at=now()+interval '15 seconds',last_error=COALESCE(last_error,'Worker lease expired'),updated_at=now()
 WHERE status IN ('leased','uploading') AND lease_expires_at<now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_stale_publish_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_publish_jobs() TO service_role;
