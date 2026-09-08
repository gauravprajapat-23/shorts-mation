-- Phase 11 — SaaS subscription, billing entitlements and tenant provisioning.

CREATE TABLE IF NOT EXISTS public.billing_plans (
  plan_key text PRIMARY KEY CHECK (plan_key IN ('free','starter','pro','business')),
  display_name text NOT NULL,
  monthly_price_cents integer NOT NULL CHECK (monthly_price_cents >= 0),
  annual_price_cents integer NOT NULL CHECK (annual_price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.billing_plans(plan_key,display_name,monthly_price_cents,annual_price_cents,sort_order,features_json) VALUES
('free','Free',0,0,0,'{"billing":"free"}'),
('starter','Starter',1900,19000,1,'{"billing":"paid"}'),
('pro','Pro',4900,49000,2,'{"billing":"paid"}'),
('business','Business',14900,149000,3,'{"billing":"paid"}')
ON CONFLICT(plan_key) DO UPDATE SET display_name=EXCLUDED.display_name,sort_order=EXCLUDED.sort_order;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_plans TO authenticated;
GRANT ALL ON public.billing_plans TO service_role;
CREATE POLICY "authenticated read billing plans" ON public.billing_plans FOR SELECT TO authenticated USING (active=true);

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe')),
  provider_customer_id text UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_customers TO authenticated;
GRANT ALL ON public.billing_customers TO service_role;
CREATE POLICY "users read own billing customer" ON public.billing_customers FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  provider_subscription_id text UNIQUE,
  provider_customer_id text,
  provider_price_id text,
  plan_key text NOT NULL DEFAULT 'free' REFERENCES public.billing_plans(plan_key),
  billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year')),
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free','trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  grace_until timestamptz,
  ended_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenant_subscriptions TO authenticated;
GRANT ALL ON public.tenant_subscriptions TO service_role;
CREATE POLICY "users read own subscription" ON public.tenant_subscriptions FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text REFERENCES public.billing_plans(plan_key),
  overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entitlement_overrides_active ON public.entitlement_overrides(user_id,starts_at,expires_at) WHERE enabled=true;
ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.entitlement_overrides TO authenticated;
GRANT ALL ON public.entitlement_overrides TO service_role;
CREATE POLICY "users read own entitlement overrides" ON public.entitlement_overrides FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  provider_invoice_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  amount_due_cents bigint NOT NULL DEFAULT 0,
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  amount_remaining_cents bigint NOT NULL DEFAULT 0,
  invoice_url text,
  invoice_pdf_url text,
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_invoices TO service_role;
CREATE POLICY "users read own invoices" ON public.billing_invoices FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.billing_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  kind text NOT NULL CHECK (kind IN ('grant','adjustment','overage','refund','consumption')),
  reference_type text,
  reference_id text,
  description text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_credit_idempotent ON public.billing_credit_ledger(user_id,kind,reference_type,reference_id) WHERE reference_id IS NOT NULL;
ALTER TABLE public.billing_credit_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_credit_ledger TO authenticated;
GRANT ALL ON public.billing_credit_ledger TO service_role;
CREATE POLICY "users read own billing credits" ON public.billing_credit_ledger FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  provider_event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'stripe',
  event_type text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed','ignored')),
  error_text text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.billing_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.phase11_effective_plan(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.tenant_subscriptions%ROWTYPE; o public.entitlement_overrides%ROWTYPE; effective text := 'free'; source text := 'default'; grace boolean := false;
BEGIN
  SELECT * INTO s FROM public.tenant_subscriptions WHERE user_id=p_user_id;
  IF FOUND THEN
    IF s.status IN ('active','trialing') THEN effective := s.plan_key; source := 'subscription';
    ELSIF s.status='past_due' AND s.grace_until IS NOT NULL AND s.grace_until>now() THEN effective := s.plan_key; source := 'grace'; grace := true;
    ELSIF s.status='canceled' AND s.current_period_end IS NOT NULL AND s.current_period_end>now() THEN effective := s.plan_key; source := 'cancel_at_period_end';
    END IF;
  END IF;
  SELECT * INTO o FROM public.entitlement_overrides WHERE user_id=p_user_id AND enabled=true AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND o.plan_key IS NOT NULL THEN effective := o.plan_key; source := 'admin_override'; END IF;
  RETURN jsonb_build_object('planKey',effective,'source',source,'inGrace',grace,'subscriptionStatus',COALESCE(s.status,'free'),'periodEnd',s.current_period_end,'graceUntil',s.grace_until,'overrideId',o.id,'overrides',COALESCE(o.overrides_json,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.phase11_effective_plan(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase11_effective_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.phase11_sync_entitlements(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; d public.capacity_plan_defaults%ROWTYPE; ov jsonb;
BEGIN
  e := public.phase11_effective_plan(p_user_id);
  SELECT * INTO d FROM public.capacity_plan_defaults WHERE plan_key=e->>'planKey';
  IF NOT FOUND THEN SELECT * INTO d FROM public.capacity_plan_defaults WHERE plan_key='free'; END IF;
  INSERT INTO public.tenant_capacity_policies(user_id,plan_key,weight,max_concurrent_renders,max_concurrent_publishes,render_daily_limit,render_monthly_limit,render_daily_budget_usd,render_monthly_budget_usd,youtube_daily_upload_limit,youtube_daily_quota_units,scheduled_reserve_minutes,r2_job_retention_days,r2_output_retention_days,enabled,updated_at)
  VALUES(p_user_id,d.plan_key,d.weight,d.max_concurrent_renders,d.max_concurrent_publishes,d.render_daily_limit,d.render_monthly_limit,d.render_daily_budget_usd,d.render_monthly_budget_usd,d.youtube_daily_upload_limit,d.youtube_daily_quota_units,d.scheduled_reserve_minutes,d.r2_job_retention_days,d.r2_output_retention_days,true,now())
  ON CONFLICT(user_id) DO UPDATE SET plan_key=EXCLUDED.plan_key,weight=EXCLUDED.weight,max_concurrent_renders=EXCLUDED.max_concurrent_renders,max_concurrent_publishes=EXCLUDED.max_concurrent_publishes,render_daily_limit=EXCLUDED.render_daily_limit,render_monthly_limit=EXCLUDED.render_monthly_limit,render_daily_budget_usd=EXCLUDED.render_daily_budget_usd,render_monthly_budget_usd=EXCLUDED.render_monthly_budget_usd,youtube_daily_upload_limit=EXCLUDED.youtube_daily_upload_limit,youtube_daily_quota_units=EXCLUDED.youtube_daily_quota_units,scheduled_reserve_minutes=EXCLUDED.scheduled_reserve_minutes,r2_job_retention_days=EXCLUDED.r2_job_retention_days,r2_output_retention_days=EXCLUDED.r2_output_retention_days,enabled=true,updated_at=now();
  ov := COALESCE(e->'overrides','{}'::jsonb);
  UPDATE public.tenant_capacity_policies SET
    weight=COALESCE((ov->>'weight')::numeric,weight),
    max_concurrent_renders=COALESCE((ov->>'maxConcurrentRenders')::integer,max_concurrent_renders),
    max_concurrent_publishes=COALESCE((ov->>'maxConcurrentPublishes')::integer,max_concurrent_publishes),
    render_daily_limit=COALESCE((ov->>'renderDailyLimit')::integer,render_daily_limit),
    render_monthly_limit=COALESCE((ov->>'renderMonthlyLimit')::integer,render_monthly_limit),
    youtube_daily_upload_limit=COALESCE((ov->>'youtubeDailyUploadLimit')::integer,youtube_daily_upload_limit),
    youtube_daily_quota_units=COALESCE((ov->>'youtubeDailyQuotaUnits')::integer,youtube_daily_quota_units),
    updated_at=now()
  WHERE user_id=p_user_id;
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION public.phase11_sync_entitlements(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase11_sync_entitlements(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.phase11_credit_balance(p_user_id uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE(sum(amount_cents),0)::bigint FROM public.billing_credit_ledger WHERE user_id=p_user_id $$;
REVOKE ALL ON FUNCTION public.phase11_credit_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase11_credit_balance(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.phase11_subscription_health()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT jsonb_build_object(
 'active',count(*) FILTER(WHERE status IN ('active','trialing')),
 'pastDue',count(*) FILTER(WHERE status='past_due'),
 'grace',count(*) FILTER(WHERE status='past_due' AND grace_until>now()),
 'canceling',count(*) FILTER(WHERE cancel_at_period_end=true),
 'mrrCents',COALESCE(sum(CASE WHEN s.status IN ('active','trialing') THEN p.monthly_price_cents ELSE 0 END),0)
) FROM public.tenant_subscriptions s LEFT JOIN public.billing_plans p ON p.plan_key=s.plan_key;
$$;
REVOKE ALL ON FUNCTION public.phase11_subscription_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase11_subscription_health() TO service_role;

CREATE TABLE IF NOT EXISTS public.tenant_billing_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  overage_enabled boolean NOT NULL DEFAULT false,
  monthly_overage_limit_cents bigint NOT NULL DEFAULT 0 CHECK(monthly_overage_limit_cents>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_billing_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenant_billing_preferences TO authenticated;
GRANT ALL ON public.tenant_billing_preferences TO service_role;
CREATE POLICY "users read own billing preferences" ON public.tenant_billing_preferences FOR SELECT TO authenticated USING(auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.billing_overage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_type text NOT NULL, reference_id text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0), status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','invoiced','waived')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,reference_type,reference_id)
);
ALTER TABLE public.billing_overage_charges ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_overage_charges TO authenticated; GRANT ALL ON public.billing_overage_charges TO service_role;
CREATE POLICY "users read own overages" ON public.billing_overage_charges FOR SELECT TO authenticated USING(auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.phase11_authorize_render_overage(p_user_id uuid,p_reference_id text,p_estimated_cost_usd numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pref public.tenant_billing_preferences%ROWTYPE; used bigint; cents bigint:=CEIL(GREATEST(0,p_estimated_cost_usd)*100)::bigint;
BEGIN
 SELECT * INTO pref FROM public.tenant_billing_preferences WHERE user_id=p_user_id;
 IF NOT FOUND OR NOT pref.overage_enabled THEN RETURN jsonb_build_object('allowed',false,'reason','overage_disabled'); END IF;
 SELECT COALESCE(sum(amount_cents),0) INTO used FROM public.billing_overage_charges WHERE user_id=p_user_id AND created_at>=date_trunc('month',now()) AND status<>'waived';
 IF used+cents>pref.monthly_overage_limit_cents THEN RETURN jsonb_build_object('allowed',false,'reason','overage_limit','usedCents',used,'limitCents',pref.monthly_overage_limit_cents); END IF;
 INSERT INTO public.billing_overage_charges(user_id,reference_type,reference_id,amount_cents) VALUES(p_user_id,'render',p_reference_id,cents) ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING;
 RETURN jsonb_build_object('allowed',true,'amountCents',cents,'usedCents',used+cents,'limitCents',pref.monthly_overage_limit_cents);
END $$;
REVOKE ALL ON FUNCTION public.phase11_authorize_render_overage(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase11_authorize_render_overage(uuid,text,numeric) TO service_role;
