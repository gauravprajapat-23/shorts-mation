CREATE TABLE public.render_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'shotstack',
  api_key_encrypted text,
  env text NOT NULL DEFAULT 'v1',
  verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.render_providers TO service_role;
ALTER TABLE public.render_providers ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated grants or policies: the API key is only ever read by
-- trusted server code through the service role.

CREATE TRIGGER trg_render_providers_updated BEFORE UPDATE ON public.render_providers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.automation_limits (
  id smallint PRIMARY KEY DEFAULT 1,
  max_global_concurrent_renders integer NOT NULL DEFAULT 6,
  max_user_concurrent_renders integer NOT NULL DEFAULT 2,
  max_renders_per_tick integer NOT NULL DEFAULT 3,
  max_global_concurrent_uploads integer NOT NULL DEFAULT 4,
  max_user_concurrent_uploads integer NOT NULL DEFAULT 1,
  max_uploads_per_tick integer NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_limits_singleton CHECK (id = 1)
);

GRANT SELECT ON public.automation_limits TO authenticated;
GRANT ALL ON public.automation_limits TO service_role;
ALTER TABLE public.automation_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone signed in can read limits" ON public.automation_limits
FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_automation_limits_updated BEFORE UPDATE ON public.automation_limits
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.automation_limits (id) VALUES (1) ON CONFLICT (id) DO NOTHING;