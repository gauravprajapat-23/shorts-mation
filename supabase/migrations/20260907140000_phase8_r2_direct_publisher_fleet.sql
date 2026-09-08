-- Phase 8 — Direct R2 publishing, publisher fleet, and scheduler leadership.
ALTER TABLE public.campaign_items ADD COLUMN IF NOT EXISTS render_output_object_key text;
CREATE INDEX IF NOT EXISTS idx_campaign_items_render_output_object_key ON public.campaign_items(render_output_object_key) WHERE render_output_object_key IS NOT NULL;

ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS source_object_key text;
ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS source_bytes bigint;
ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS source_etag text;
ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS external_commit_checkpoint text;

CREATE TABLE IF NOT EXISTS public.publisher_nodes (
  worker_id text PRIMARY KEY,
  hostname text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draining','offline')),
  active_jobs integer NOT NULL DEFAULT 0,
  max_concurrency integer NOT NULL DEFAULT 1,
  version text NOT NULL DEFAULT 'publisher-v8',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.publisher_nodes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.publisher_nodes TO service_role;

CREATE OR REPLACE FUNCTION public.phase8_dispatch_campaign_scheduler(
  p_worker_id text,
  p_horizon_minutes integer DEFAULT 1440
) RETURNS TABLE(leader_acquired boolean, render_candidates integer, publish_candidates integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE got boolean; r record;
BEGIN
  got := pg_try_advisory_xact_lock(hashtext('shorts-mation:campaign-scheduler:v8'));
  IF NOT got THEN RETURN QUERY SELECT false,0,0; RETURN; END IF;
  SELECT * INTO r FROM public.dispatch_upcoming_campaign_items(p_horizon_minutes);
  RETURN QUERY SELECT true,COALESCE(r.render_candidates,0),COALESCE(r.publish_candidates,0);
END $$;
REVOKE ALL ON FUNCTION public.phase8_dispatch_campaign_scheduler(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase8_dispatch_campaign_scheduler(text,integer) TO service_role;

-- Phase 8 readiness accepts authoritative R2 output identity and no longer
-- requires a Supabase Storage copy.
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

  INSERT INTO public.publish_jobs(campaign_item_id,campaign_id,user_id,intended_publish_at,next_attempt_at,source_object_key)
  SELECT ci.id,ci.campaign_id,ci.user_id,
         CASE WHEN ci.schedule_at > now()+interval '1 minute' THEN ci.schedule_at ELSE NULL END,
         GREATEST(COALESCE(ci.upload_due_at,now()),now()),ci.render_output_object_key
    FROM public.campaign_items ci JOIN public.campaigns c ON c.id=ci.campaign_id
   WHERE c.status='active' AND ci.is_paused=false
     AND (ci.render_output_object_key IS NOT NULL OR ci.rendered_video_url IS NOT NULL)
     AND ci.youtube_video_id IS NULL
     AND COALESCE(ci.upload_due_at,ci.schedule_at,now()) <= now()+interval '5 minutes'
  ON CONFLICT (campaign_item_id) DO UPDATE
    SET intended_publish_at=EXCLUDED.intended_publish_at,
        source_object_key=COALESCE(EXCLUDED.source_object_key,public.publish_jobs.source_object_key),
        updated_at=now()
    WHERE public.publish_jobs.status NOT IN ('completed','cancelled');
  GET DIAGNOSTICS v_publish = ROW_COUNT;
  RETURN QUERY SELECT v_render,v_publish;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_upcoming_campaign_items(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_upcoming_campaign_items(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.publisher_fleet_health(p_stale_seconds integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  UPDATE public.publisher_nodes SET status='offline'
   WHERE status<>'offline' AND last_heartbeat_at < now()-make_interval(secs=>GREATEST(10,p_stale_seconds));
  SELECT jsonb_build_object(
    'nodes',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.worker_id) FROM public.publisher_nodes n),'[]'::jsonb),
    'queue',jsonb_build_object(
      'pending',(SELECT count(*) FROM public.publish_jobs WHERE status='pending'),
      'retry_wait',(SELECT count(*) FROM public.publish_jobs WHERE status='retry_wait'),
      'uploading',(SELECT count(*) FROM public.publish_jobs WHERE status IN ('leased','uploading')),
      'completed',(SELECT count(*) FROM public.publish_jobs WHERE status='completed'),
      'failed',(SELECT count(*) FROM public.publish_jobs WHERE status='failed')
    )
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.publisher_fleet_health(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publisher_fleet_health(integer) TO service_role;
