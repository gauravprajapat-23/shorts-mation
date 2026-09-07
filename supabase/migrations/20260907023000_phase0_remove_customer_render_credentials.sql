-- Phase 0: rendering is application infrastructure, never customer BYO config.
-- Keep the historical table temporarily for backwards-compatible migrations,
-- but destroy any stored per-user worker credentials and prevent new browser use.
UPDATE public.render_providers
SET worker_url = NULL,
    worker_secret_encrypted = NULL,
    api_key_encrypted = NULL,
    verified_at = NULL,
    last_error = 'Phase 0: renderer credentials are managed by application infrastructure.';

COMMENT ON TABLE public.render_providers IS
  'Deprecated Phase 0 compatibility table. Render worker URL/secrets are application infrastructure environment variables, not per-user settings.';
