-- V2.22 — AI Content Generation Layer
CREATE TABLE IF NOT EXISTS public.ai_providers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','openrouter')),
  api_key_encrypted text,
  model text NOT NULL,
  base_url text,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_providers FROM anon, authenticated;
GRANT ALL ON public.ai_providers TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id uuid REFERENCES public.automation_data_studios(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('openai','openrouter')),
  model text NOT NULL,
  prompt text NOT NULL,
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 100),
  generated_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_message text,
  usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_runs_user_created ON public.ai_generation_runs(user_id,created_at DESC);
ALTER TABLE public.ai_generation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_generation_runs TO authenticated;
GRANT ALL ON public.ai_generation_runs TO service_role;
CREATE POLICY "users read own ai runs" ON public.ai_generation_runs FOR SELECT TO authenticated USING (user_id=auth.uid());
