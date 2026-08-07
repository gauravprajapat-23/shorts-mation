CREATE TABLE public.automation_user_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_concurrent_renders integer,
  max_concurrent_uploads integer,
  note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_user_limits_renders_range CHECK (max_concurrent_renders IS NULL OR (max_concurrent_renders >= 0 AND max_concurrent_renders <= 50)),
  CONSTRAINT automation_user_limits_uploads_range CHECK (max_concurrent_uploads IS NULL OR (max_concurrent_uploads >= 0 AND max_concurrent_uploads <= 50))
);

GRANT SELECT ON public.automation_user_limits TO authenticated;
GRANT ALL ON public.automation_user_limits TO service_role;

ALTER TABLE public.automation_user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own automation limit" ON public.automation_user_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_automation_user_limits_updated
  BEFORE UPDATE ON public.automation_user_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();