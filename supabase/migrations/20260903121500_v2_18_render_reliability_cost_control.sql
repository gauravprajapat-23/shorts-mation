-- V2.18 — Render Reliability & Cost Control
ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS render_priority integer NOT NULL DEFAULT 50 CHECK (render_priority BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS render_retry_count integer NOT NULL DEFAULT 0 CHECK (render_retry_count >= 0),
  ADD COLUMN IF NOT EXISTS render_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (render_estimated_cost_usd >= 0);

ALTER TABLE public.render_attempts DROP CONSTRAINT IF EXISTS render_attempts_status_check;
ALTER TABLE public.render_attempts ADD CONSTRAINT render_attempts_status_check
CHECK (status IN ('claimed','submitted','completed','failed','abandoned','cancelled','timed_out','dead_letter'));
ALTER TABLE public.render_attempts
  ADD COLUMN IF NOT EXISTS retry_number integer NOT NULL DEFAULT 0 CHECK (retry_number >= 0),
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS output_bytes bigint,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.render_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_item_id uuid NOT NULL REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  render_attempt_id uuid REFERENCES public.render_attempts(id) ON DELETE SET NULL,
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  event text NOT NULL,
  message text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_render_logs_item_created ON public.render_logs(campaign_item_id, created_at DESC);
ALTER TABLE public.render_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.render_logs TO authenticated;
GRANT ALL ON public.render_logs TO service_role;
DROP POLICY IF EXISTS "users select own render logs" ON public.render_logs;
CREATE POLICY "users select own render logs" ON public.render_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.render_budgets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_budget_usd numeric(12,2) NOT NULL DEFAULT 25 CHECK (monthly_budget_usd >= 0),
  max_cost_per_render_usd numeric(12,4) NOT NULL DEFAULT 1 CHECK (max_cost_per_render_usd >= 0),
  max_render_seconds integer NOT NULL DEFAULT 180 CHECK (max_render_seconds BETWEEN 5 AND 3600),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  base_backoff_seconds integer NOT NULL DEFAULT 60 CHECK (base_backoff_seconds BETWEEN 5 AND 86400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.render_budgets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.render_budgets TO authenticated;
GRANT ALL ON public.render_budgets TO service_role;
DROP POLICY IF EXISTS "users manage own render budget" ON public.render_budgets;
CREATE POLICY "users manage own render budget" ON public.render_budgets FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_items_render_reliable_queue
ON public.campaign_items(render_priority DESC, render_next_attempt_at, render_due_at, schedule_at)
WHERE rendered_video_url IS NULL AND render_dead_lettered_at IS NULL;

CREATE OR REPLACE FUNCTION public.cancel_render_item(p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.campaign_items%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.campaign_items WHERE id=p_item_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign item not found'; END IF;
  IF v.rendered_video_url IS NOT NULL OR v.status IN ('uploading','scheduled','uploaded') THEN RAISE EXCEPTION 'render can no longer be cancelled'; END IF;
  UPDATE public.campaign_items SET render_cancel_requested_at=now(), error_message='Render cancellation requested' WHERE id=p_item_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cancel_render_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_render_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recover_dead_letter_render(p_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.campaign_items SET status='pending', render_dead_lettered_at=NULL, render_retry_count=0,
    render_next_attempt_at=now(), render_cancel_requested_at=NULL, error_message=NULL, render_job_ref=NULL, active_render_attempt_id=NULL
  WHERE id=p_item_id AND user_id=auth.uid() AND render_dead_lettered_at IS NOT NULL;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.recover_dead_letter_render(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recover_dead_letter_render(uuid) TO authenticated;
