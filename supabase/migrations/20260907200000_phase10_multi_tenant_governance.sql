-- Phase 10 — Multi-tenant capacity governance, fair scheduling and cost controls.

CREATE TABLE IF NOT EXISTS public.tenant_capacity_policies (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'free',
  weight numeric(8,3) NOT NULL DEFAULT 1 CHECK (weight > 0),
  max_concurrent_renders integer NOT NULL DEFAULT 1 CHECK (max_concurrent_renders > 0),
  max_concurrent_publishes integer NOT NULL DEFAULT 1 CHECK (max_concurrent_publishes > 0),
  render_daily_limit integer NOT NULL DEFAULT 20 CHECK (render_daily_limit >= 0),
  render_monthly_limit integer NOT NULL DEFAULT 300 CHECK (render_monthly_limit >= 0),
  render_daily_budget_usd numeric(12,4) NOT NULL DEFAULT 5 CHECK (render_daily_budget_usd >= 0),
  render_monthly_budget_usd numeric(12,4) NOT NULL DEFAULT 50 CHECK (render_monthly_budget_usd >= 0),
  youtube_daily_upload_limit integer NOT NULL DEFAULT 10 CHECK (youtube_daily_upload_limit >= 0),
  youtube_daily_quota_units integer NOT NULL DEFAULT 16000 CHECK (youtube_daily_quota_units >= 0),
  scheduled_reserve_minutes integer NOT NULL DEFAULT 45 CHECK (scheduled_reserve_minutes >= 0),
  r2_job_retention_days integer NOT NULL DEFAULT 7 CHECK (r2_job_retention_days >= 1),
  r2_output_retention_days integer NOT NULL DEFAULT 30 CHECK (r2_output_retention_days >= 1),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_capacity_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenant_capacity_policies TO authenticated;
GRANT ALL ON public.tenant_capacity_policies TO service_role;
DROP POLICY IF EXISTS "users read own capacity policy" ON public.tenant_capacity_policies;
CREATE POLICY "users read own capacity policy" ON public.tenant_capacity_policies FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.tenant_fairness_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  render_vruntime numeric(20,6) NOT NULL DEFAULT 0,
  publish_vruntime numeric(20,6) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_fairness_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tenant_fairness_state TO service_role;

CREATE TABLE IF NOT EXISTS public.capacity_usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('render_submitted','render_completed','render_failed','publish_completed','youtube_quota_reserved','r2_bytes_deleted')),
  units numeric(18,6) NOT NULL DEFAULT 1,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  reference_type text,
  reference_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_usage_idempotent ON public.capacity_usage_events(user_id,event_type,reference_type,reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capacity_usage_user_time ON public.capacity_usage_events(user_id,created_at DESC);
ALTER TABLE public.capacity_usage_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.capacity_usage_events TO authenticated;
GRANT ALL ON public.capacity_usage_events TO service_role;
DROP POLICY IF EXISTS "users read own capacity usage" ON public.capacity_usage_events;
CREATE POLICY "users read own capacity usage" ON public.capacity_usage_events FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.youtube_quota_reservations (
  publish_job_id uuid PRIMARY KEY REFERENCES public.publish_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimated_units integer NOT NULL CHECK (estimated_units > 0),
  reserved_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_youtube_quota_user_day ON public.youtube_quota_reservations(user_id,reserved_on);
ALTER TABLE public.youtube_quota_reservations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.youtube_quota_reservations TO service_role;

CREATE TABLE IF NOT EXISTS public.r2_cleanup_queue (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  object_prefix text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('job','output','asset-orphan')),
  eligible_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','failed')),
  lease_owner text,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  bytes_deleted bigint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_r2_cleanup_ready ON public.r2_cleanup_queue(status,eligible_at) WHERE status IN ('pending','failed');
ALTER TABLE public.r2_cleanup_queue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.r2_cleanup_queue TO service_role;

ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS governance_priority numeric(10,4) NOT NULL DEFAULT 0;
ALTER TABLE public.publish_jobs ADD COLUMN IF NOT EXISTS quota_reserved boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.phase10_policy(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.tenant_capacity_policies%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.tenant_capacity_policies WHERE user_id=p_user_id AND enabled=true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('planKey','free','weight',1,'maxConcurrentRenders',1,'maxConcurrentPublishes',1,
      'renderDailyLimit',20,'renderMonthlyLimit',300,'renderDailyBudgetUsd',5,'renderMonthlyBudgetUsd',50,
      'youtubeDailyUploadLimit',10,'youtubeDailyQuotaUnits',16000,'scheduledReserveMinutes',45,
      'r2JobRetentionDays',7,'r2OutputRetentionDays',30);
  END IF;
  RETURN jsonb_build_object('planKey',p.plan_key,'weight',p.weight,'maxConcurrentRenders',p.max_concurrent_renders,
    'maxConcurrentPublishes',p.max_concurrent_publishes,'renderDailyLimit',p.render_daily_limit,
    'renderMonthlyLimit',p.render_monthly_limit,'renderDailyBudgetUsd',p.render_daily_budget_usd,
    'renderMonthlyBudgetUsd',p.render_monthly_budget_usd,'youtubeDailyUploadLimit',p.youtube_daily_upload_limit,
    'youtubeDailyQuotaUnits',p.youtube_daily_quota_units,'scheduledReserveMinutes',p.scheduled_reserve_minutes,
    'r2JobRetentionDays',p.r2_job_retention_days,'r2OutputRetentionDays',p.r2_output_retention_days);
END $$;
REVOKE ALL ON FUNCTION public.phase10_policy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_policy(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.phase10_record_usage(
  p_user_id uuid,p_event_type text,p_units numeric DEFAULT 1,p_cost_usd numeric DEFAULT 0,
  p_reference_type text DEFAULT NULL,p_reference_id text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.capacity_usage_events(user_id,event_type,units,cost_usd,reference_type,reference_id,metadata_json)
  VALUES(p_user_id,p_event_type,GREATEST(0,p_units),GREATEST(0,p_cost_usd),p_reference_type,p_reference_id,COALESCE(p_metadata,'{}'::jsonb))
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.phase10_record_usage(uuid,text,numeric,numeric,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_record_usage(uuid,text,numeric,numeric,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.phase10_reserve_youtube_quota(p_publish_job_id uuid,p_estimated_units integer DEFAULT 1600)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.publish_jobs%ROWTYPE; p jsonb; used_units bigint; used_uploads bigint; lim_units integer; lim_uploads integer;
BEGIN
  SELECT * INTO j FROM public.publish_jobs WHERE id=p_publish_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publish job not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.youtube_quota_reservations WHERE publish_job_id=j.id) THEN
    RETURN jsonb_build_object('allowed',true,'alreadyReserved',true);
  END IF;
  p := public.phase10_policy(j.user_id);
  lim_units := (p->>'youtubeDailyQuotaUnits')::integer; lim_uploads := (p->>'youtubeDailyUploadLimit')::integer;
  SELECT COALESCE(sum(estimated_units),0),count(*) INTO used_units,used_uploads FROM public.youtube_quota_reservations WHERE user_id=j.user_id AND reserved_on=CURRENT_DATE;
  IF used_uploads >= lim_uploads OR used_units + GREATEST(1,p_estimated_units) > lim_units THEN
    RETURN jsonb_build_object('allowed',false,'usedUnits',used_units,'limitUnits',lim_units,'usedUploads',used_uploads,'limitUploads',lim_uploads);
  END IF;
  INSERT INTO public.youtube_quota_reservations(publish_job_id,user_id,estimated_units) VALUES(j.id,j.user_id,GREATEST(1,p_estimated_units));
  UPDATE public.publish_jobs SET quota_reserved=true,updated_at=now() WHERE id=j.id;
  PERFORM public.phase10_record_usage(j.user_id,'youtube_quota_reserved',GREATEST(1,p_estimated_units),0,'publish_job',j.id::text,'{}'::jsonb);
  RETURN jsonb_build_object('allowed',true,'alreadyReserved',false,'usedUnits',used_units+GREATEST(1,p_estimated_units),'limitUnits',lim_units);
END $$;
REVOKE ALL ON FUNCTION public.phase10_reserve_youtube_quota(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_reserve_youtube_quota(uuid,integer) TO service_role;

-- Weighted-fair publisher claiming. Each claim advances tenant virtual runtime by 1/weight.
-- Jobs inside the scheduled reserve window receive urgency ahead of ordinary fair-share work,
-- but each tenant's max concurrency and daily publish quota remain enforced.
CREATE OR REPLACE FUNCTION public.claim_publish_jobs(p_worker_id text,p_limit integer DEFAULT 2,p_lease_seconds integer DEFAULT 90)
RETURNS SETOF public.publish_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE picked public.publish_jobs%ROWTYPE; pol jsonb; i integer; maxc integer; weight numeric; reserve_mins integer; daily_limit integer; active_count integer; daily_done integer;
BEGIN
  FOR i IN 1..GREATEST(1,LEAST(p_limit,20)) LOOP
    SELECT pj.* INTO picked
    FROM public.publish_jobs pj
    LEFT JOIN public.tenant_capacity_policies tcp ON tcp.user_id=pj.user_id AND tcp.enabled=true
    LEFT JOIN public.tenant_fairness_state fs ON fs.user_id=pj.user_id
    WHERE pj.status IN ('pending','retry_wait') AND pj.next_attempt_at<=now()
      AND (SELECT count(*) FROM public.publish_jobs a WHERE a.user_id=pj.user_id AND a.status IN ('leased','uploading')) < COALESCE(tcp.max_concurrent_publishes,1)
      AND (SELECT count(*) FROM public.publish_jobs d WHERE d.user_id=pj.user_id AND d.status='completed' AND d.completed_at>=date_trunc('day',now())) < COALESCE(tcp.youtube_daily_upload_limit,10)
    ORDER BY
      CASE WHEN pj.intended_publish_at IS NOT NULL AND pj.intended_publish_at <= now()+make_interval(mins=>COALESCE(tcp.scheduled_reserve_minutes,45)) THEN 0 ELSE 1 END,
      COALESCE(fs.publish_vruntime,0), pj.next_attempt_at, pj.created_at
    FOR UPDATE OF pj SKIP LOCKED LIMIT 1;
    EXIT WHEN NOT FOUND;
    pol := public.phase10_policy(picked.user_id); maxc := (pol->>'maxConcurrentPublishes')::integer; weight := (pol->>'weight')::numeric; reserve_mins := (pol->>'scheduledReserveMinutes')::integer; daily_limit := (pol->>'youtubeDailyUploadLimit')::integer;
    INSERT INTO public.tenant_fairness_state(user_id,publish_vruntime) VALUES(picked.user_id,1/GREATEST(weight,0.001))
      ON CONFLICT(user_id) DO UPDATE SET publish_vruntime=public.tenant_fairness_state.publish_vruntime + 1/GREATEST(weight,0.001),updated_at=now();
    UPDATE public.publish_jobs SET status='leased',lease_owner=p_worker_id,lease_expires_at=now()+make_interval(secs=>GREATEST(30,p_lease_seconds)),heartbeat_at=now(),attempt_count=attempt_count+1,
      governance_priority=CASE WHEN intended_publish_at IS NOT NULL AND intended_publish_at<=now()+make_interval(mins=>reserve_mins) THEN 100 ELSE 0 END,updated_at=now()
      WHERE id=picked.id RETURNING * INTO picked;
    RETURN NEXT picked;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_publish_jobs(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_jobs(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.phase10_governance_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tenants bigint; throttled bigint; day_cost numeric; month_cost numeric; day_renders bigint; month_renders bigint; yt_reserved bigint; cleanup_pending bigint;
BEGIN
  SELECT count(*) INTO tenants FROM public.tenant_capacity_policies WHERE enabled=true;
  SELECT COALESCE(sum(cost_usd),0),count(*) FILTER(WHERE event_type='render_completed') INTO day_cost,day_renders FROM public.capacity_usage_events WHERE created_at>=date_trunc('day',now());
  SELECT COALESCE(sum(cost_usd),0),count(*) FILTER(WHERE event_type='render_completed') INTO month_cost,month_renders FROM public.capacity_usage_events WHERE created_at>=date_trunc('month',now());
  SELECT COALESCE(sum(estimated_units),0) INTO yt_reserved FROM public.youtube_quota_reservations WHERE reserved_on=CURRENT_DATE;
  SELECT count(*) INTO cleanup_pending FROM public.r2_cleanup_queue WHERE status IN ('pending','failed') AND eligible_at<=now();
  SELECT count(*) INTO throttled FROM public.publish_jobs pj LEFT JOIN public.tenant_capacity_policies p ON p.user_id=pj.user_id WHERE pj.status IN ('pending','retry_wait') AND
    (SELECT count(*) FROM public.publish_jobs a WHERE a.user_id=pj.user_id AND a.status IN ('leased','uploading')) >= COALESCE(p.max_concurrent_publishes,1);
  RETURN jsonb_build_object('generatedAt',now(),'tenants',tenants,'throttledPublishJobs',throttled,
    'today',jsonb_build_object('renderCompleted',day_renders,'renderCostUsd',day_cost,'youtubeQuotaReserved',yt_reserved),
    'month',jsonb_build_object('renderCompleted',month_renders,'renderCostUsd',month_cost),
    'r2',jsonb_build_object('cleanupPending',cleanup_pending),
    'topTenants',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT e.user_id,COALESCE(p.plan_key,'free') plan_key,count(*) FILTER(WHERE e.event_type='render_completed') renders,
        count(*) FILTER(WHERE e.event_type='publish_completed') publishes,round(COALESCE(sum(e.cost_usd),0),4) cost_usd
      FROM public.capacity_usage_events e LEFT JOIN public.tenant_capacity_policies p ON p.user_id=e.user_id
      WHERE e.created_at>=date_trunc('month',now()) GROUP BY e.user_id,p.plan_key ORDER BY COALESCE(sum(e.cost_usd),0) DESC LIMIT 10
    ) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.phase10_governance_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_governance_health() TO service_role;

-- Plan catalog and burst/backpressure controls. These defaults are operational
-- policy, not billing truth; billing can assign/copy them into tenant policies.
CREATE TABLE IF NOT EXISTS public.capacity_plan_defaults (
  plan_key text PRIMARY KEY,
  weight numeric(8,3) NOT NULL,
  max_concurrent_renders integer NOT NULL,
  max_concurrent_publishes integer NOT NULL,
  render_daily_limit integer NOT NULL,
  render_monthly_limit integer NOT NULL,
  render_daily_budget_usd numeric(12,4) NOT NULL,
  render_monthly_budget_usd numeric(12,4) NOT NULL,
  youtube_daily_upload_limit integer NOT NULL,
  youtube_daily_quota_units integer NOT NULL,
  render_submissions_per_minute integer NOT NULL,
  scheduled_reserve_minutes integer NOT NULL,
  r2_job_retention_days integer NOT NULL,
  r2_output_retention_days integer NOT NULL
);
INSERT INTO public.capacity_plan_defaults VALUES
 ('free',1,1,1,20,300,5,50,10,16000,6,45,7,30),
 ('starter',2,2,1,75,1500,15,150,25,40000,12,60,7,45),
 ('pro',4,4,2,250,6000,50,500,75,120000,30,90,10,60),
 ('business',8,8,4,1000,30000,200,2000,250,400000,90,120,14,90)
ON CONFLICT(plan_key) DO NOTHING;
ALTER TABLE public.capacity_plan_defaults ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.capacity_plan_defaults TO authenticated;
GRANT ALL ON public.capacity_plan_defaults TO service_role;

ALTER TABLE public.tenant_capacity_policies ADD COLUMN IF NOT EXISTS render_submissions_per_minute integer NOT NULL DEFAULT 6 CHECK (render_submissions_per_minute > 0);
ALTER TABLE public.control_plane_settings ADD COLUMN IF NOT EXISTS youtube_global_daily_quota_units integer NOT NULL DEFAULT 900000 CHECK (youtube_global_daily_quota_units > 0);
ALTER TABLE public.control_plane_settings ADD COLUMN IF NOT EXISTS youtube_reserved_system_units integer NOT NULL DEFAULT 10000 CHECK (youtube_reserved_system_units >= 0);

CREATE TABLE IF NOT EXISTS public.tenant_backpressure_windows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  rejection_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,kind)
);
ALTER TABLE public.tenant_backpressure_windows ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tenant_backpressure_windows TO service_role;

CREATE OR REPLACE FUNCTION public.phase10_policy(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.tenant_capacity_policies%ROWTYPE; d public.capacity_plan_defaults%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.tenant_capacity_policies WHERE user_id=p_user_id AND enabled=true;
  IF FOUND THEN
    RETURN jsonb_build_object('planKey',p.plan_key,'weight',p.weight,'maxConcurrentRenders',p.max_concurrent_renders,
      'maxConcurrentPublishes',p.max_concurrent_publishes,'renderDailyLimit',p.render_daily_limit,'renderMonthlyLimit',p.render_monthly_limit,
      'renderDailyBudgetUsd',p.render_daily_budget_usd,'renderMonthlyBudgetUsd',p.render_monthly_budget_usd,
      'youtubeDailyUploadLimit',p.youtube_daily_upload_limit,'youtubeDailyQuotaUnits',p.youtube_daily_quota_units,
      'renderSubmissionsPerMinute',p.render_submissions_per_minute,'scheduledReserveMinutes',p.scheduled_reserve_minutes,
      'r2JobRetentionDays',p.r2_job_retention_days,'r2OutputRetentionDays',p.r2_output_retention_days);
  END IF;
  SELECT * INTO d FROM public.capacity_plan_defaults WHERE plan_key='free';
  RETURN jsonb_build_object('planKey',d.plan_key,'weight',d.weight,'maxConcurrentRenders',d.max_concurrent_renders,
    'maxConcurrentPublishes',d.max_concurrent_publishes,'renderDailyLimit',d.render_daily_limit,'renderMonthlyLimit',d.render_monthly_limit,
    'renderDailyBudgetUsd',d.render_daily_budget_usd,'renderMonthlyBudgetUsd',d.render_monthly_budget_usd,
    'youtubeDailyUploadLimit',d.youtube_daily_upload_limit,'youtubeDailyQuotaUnits',d.youtube_daily_quota_units,
    'renderSubmissionsPerMinute',d.render_submissions_per_minute,'scheduledReserveMinutes',d.scheduled_reserve_minutes,
    'r2JobRetentionDays',d.r2_job_retention_days,'r2OutputRetentionDays',d.r2_output_retention_days);
END $$;

CREATE OR REPLACE FUNCTION public.phase10_consume_tenant_admission(p_user_id uuid,p_kind text DEFAULT 'render')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.tenant_backpressure_windows%ROWTYPE; p jsonb; lim integer; nowv timestamptz:=now();
BEGIN
  p:=public.phase10_policy(p_user_id); lim:=GREATEST(1,(p->>'renderSubmissionsPerMinute')::integer);
  INSERT INTO public.tenant_backpressure_windows(user_id,kind,window_started_at,request_count) VALUES(p_user_id,p_kind,nowv,0)
    ON CONFLICT(user_id,kind) DO NOTHING;
  SELECT * INTO w FROM public.tenant_backpressure_windows WHERE user_id=p_user_id AND kind=p_kind FOR UPDATE;
  IF w.blocked_until IS NOT NULL AND w.blocked_until>nowv THEN
    UPDATE public.tenant_backpressure_windows SET rejection_count=rejection_count+1,updated_at=nowv WHERE user_id=p_user_id AND kind=p_kind;
    RETURN jsonb_build_object('allowed',false,'reason','backpressure','retryAfterSeconds',CEIL(EXTRACT(EPOCH FROM (w.blocked_until-nowv))));
  END IF;
  IF w.window_started_at < nowv-interval '1 minute' THEN w.window_started_at:=nowv;w.request_count:=0; END IF;
  IF w.request_count>=lim THEN
    UPDATE public.tenant_backpressure_windows SET blocked_until=nowv+interval '30 seconds',rejection_count=rejection_count+1,window_started_at=w.window_started_at,request_count=w.request_count,updated_at=nowv WHERE user_id=p_user_id AND kind=p_kind;
    RETURN jsonb_build_object('allowed',false,'reason','rate_limit','retryAfterSeconds',30,'limitPerMinute',lim);
  END IF;
  UPDATE public.tenant_backpressure_windows SET window_started_at=w.window_started_at,request_count=w.request_count+1,blocked_until=NULL,updated_at=nowv WHERE user_id=p_user_id AND kind=p_kind;
  RETURN jsonb_build_object('allowed',true,'remaining',GREATEST(0,lim-w.request_count-1),'limitPerMinute',lim);
END $$;
REVOKE ALL ON FUNCTION public.phase10_consume_tenant_admission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_consume_tenant_admission(uuid,text) TO service_role;

-- Replace quota reservation with both tenant allocation and a global control-plane ceiling.
CREATE OR REPLACE FUNCTION public.phase10_reserve_youtube_quota(p_publish_job_id uuid,p_estimated_units integer DEFAULT 1600)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.publish_jobs%ROWTYPE; p jsonb; used_units bigint; used_uploads bigint; global_used bigint; lim_units integer; lim_uploads integer; global_lim integer; system_reserve integer;
BEGIN
  SELECT * INTO j FROM public.publish_jobs WHERE id=p_publish_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publish job not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.youtube_quota_reservations WHERE publish_job_id=j.id) THEN RETURN jsonb_build_object('allowed',true,'alreadyReserved',true); END IF;
  p:=public.phase10_policy(j.user_id); lim_units:=(p->>'youtubeDailyQuotaUnits')::integer; lim_uploads:=(p->>'youtubeDailyUploadLimit')::integer;
  SELECT youtube_global_daily_quota_units,youtube_reserved_system_units INTO global_lim,system_reserve FROM public.control_plane_settings WHERE id=true;
  SELECT COALESCE(sum(estimated_units),0),count(*) INTO used_units,used_uploads FROM public.youtube_quota_reservations WHERE user_id=j.user_id AND reserved_on=CURRENT_DATE;
  SELECT COALESCE(sum(estimated_units),0) INTO global_used FROM public.youtube_quota_reservations WHERE reserved_on=CURRENT_DATE;
  IF used_uploads>=lim_uploads OR used_units+GREATEST(1,p_estimated_units)>lim_units THEN RETURN jsonb_build_object('allowed',false,'reason','tenant_quota','usedUnits',used_units,'limitUnits',lim_units,'usedUploads',used_uploads,'limitUploads',lim_uploads); END IF;
  IF global_used+GREATEST(1,p_estimated_units)>GREATEST(0,global_lim-system_reserve) THEN RETURN jsonb_build_object('allowed',false,'reason','global_quota','globalUsedUnits',global_used,'globalLimitUnits',global_lim,'reservedSystemUnits',system_reserve); END IF;
  INSERT INTO public.youtube_quota_reservations(publish_job_id,user_id,estimated_units) VALUES(j.id,j.user_id,GREATEST(1,p_estimated_units));
  UPDATE public.publish_jobs SET quota_reserved=true,updated_at=now() WHERE id=j.id;
  PERFORM public.phase10_record_usage(j.user_id,'youtube_quota_reserved',GREATEST(1,p_estimated_units),0,'publish_job',j.id::text,'{}'::jsonb);
  RETURN jsonb_build_object('allowed',true,'alreadyReserved',false,'usedUnits',used_units+GREATEST(1,p_estimated_units),'limitUnits',lim_units,'globalUsedUnits',global_used+GREATEST(1,p_estimated_units),'globalLimitUnits',global_lim);
END $$;

CREATE OR REPLACE FUNCTION public.phase10_assign_capacity_plan(p_user_id uuid,p_plan_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.capacity_plan_defaults%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.capacity_plan_defaults WHERE plan_key=p_plan_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown capacity plan: %',p_plan_key; END IF;
  INSERT INTO public.tenant_capacity_policies(user_id,plan_key,weight,max_concurrent_renders,max_concurrent_publishes,render_daily_limit,render_monthly_limit,
    render_daily_budget_usd,render_monthly_budget_usd,youtube_daily_upload_limit,youtube_daily_quota_units,render_submissions_per_minute,scheduled_reserve_minutes,r2_job_retention_days,r2_output_retention_days,enabled,updated_at)
  VALUES(p_user_id,d.plan_key,d.weight,d.max_concurrent_renders,d.max_concurrent_publishes,d.render_daily_limit,d.render_monthly_limit,
    d.render_daily_budget_usd,d.render_monthly_budget_usd,d.youtube_daily_upload_limit,d.youtube_daily_quota_units,d.render_submissions_per_minute,d.scheduled_reserve_minutes,d.r2_job_retention_days,d.r2_output_retention_days,true,now())
  ON CONFLICT(user_id) DO UPDATE SET plan_key=EXCLUDED.plan_key,weight=EXCLUDED.weight,max_concurrent_renders=EXCLUDED.max_concurrent_renders,
    max_concurrent_publishes=EXCLUDED.max_concurrent_publishes,render_daily_limit=EXCLUDED.render_daily_limit,render_monthly_limit=EXCLUDED.render_monthly_limit,
    render_daily_budget_usd=EXCLUDED.render_daily_budget_usd,render_monthly_budget_usd=EXCLUDED.render_monthly_budget_usd,
    youtube_daily_upload_limit=EXCLUDED.youtube_daily_upload_limit,youtube_daily_quota_units=EXCLUDED.youtube_daily_quota_units,
    render_submissions_per_minute=EXCLUDED.render_submissions_per_minute,scheduled_reserve_minutes=EXCLUDED.scheduled_reserve_minutes,
    r2_job_retention_days=EXCLUDED.r2_job_retention_days,r2_output_retention_days=EXCLUDED.r2_output_retention_days,enabled=true,updated_at=now();
  RETURN public.phase10_policy(p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.phase10_assign_capacity_plan(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase10_assign_capacity_plan(uuid,text) TO service_role;
