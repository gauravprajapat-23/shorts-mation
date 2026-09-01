-- Editor V2.13 — Production Security, Queue Integrity & Architecture Repair

-- 1) Default templates are service/admin managed only. A normal user may not
-- promote a private template into the globally-readable default catalog.
UPDATE public.templates SET is_default = false WHERE user_id IS NOT NULL AND is_default = true;
DROP POLICY IF EXISTS "users update own templates" ON public.templates;
CREATE POLICY "users update own private templates"
ON public.templates FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND is_default = false)
WITH CHECK (auth.uid() = user_id AND is_default = false);

-- 2) Cross-tenant relationship integrity. RLS protects direct browser access,
-- but service-role workers bypass RLS, so ownership must also be a DB invariant.
CREATE OR REPLACE FUNCTION public.assert_campaign_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.youtube_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.youtube_connections yc
    WHERE yc.id = NEW.youtube_connection_id AND yc.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'youtube connection does not belong to campaign owner' USING ERRCODE = '23514';
  END IF;

  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id = NEW.template_id AND (t.user_id = NEW.user_id OR t.is_default = true)
  ) THEN
    RAISE EXCEPTION 'template is not available to campaign owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_tenant_integrity ON public.campaigns;
CREATE TRIGGER trg_campaign_tenant_integrity
BEFORE INSERT OR UPDATE OF user_id, youtube_connection_id, template_id ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.assert_campaign_tenant_integrity();

CREATE OR REPLACE FUNCTION public.assert_campaign_item_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = NEW.campaign_id AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'campaign item owner must match campaign owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_item_tenant_integrity ON public.campaign_items;
CREATE TRIGGER trg_campaign_item_tenant_integrity
BEFORE INSERT OR UPDATE OF campaign_id, user_id ON public.campaign_items
FOR EACH ROW EXECUTE FUNCTION public.assert_campaign_item_tenant_integrity();

-- Validate existing data before the worker starts relying on the invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.campaign_items ci
    JOIN public.campaigns c ON c.id = ci.campaign_id
    WHERE ci.user_id <> c.user_id
  ) THEN
    RAISE EXCEPTION 'existing cross-tenant campaign_items must be repaired before V2.13 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.youtube_connections yc ON yc.id = c.youtube_connection_id
    WHERE yc.user_id <> c.user_id
  ) THEN
    RAISE EXCEPTION 'existing cross-tenant youtube connections must be repaired before V2.13 migration';
  END IF;
END $$;

-- 3) Immutable render/upload attempt history + idempotency keys.
CREATE TABLE IF NOT EXISTS public.render_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_item_id uuid NOT NULL REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'shotstack',
  provider_job_ref text UNIQUE,
  callback_token_hash text,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','submitted','completed','failed','abandoned')),
  error_message text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finished_at timestamptz,
  worker_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_render_attempts_item_created ON public.render_attempts(campaign_item_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_attempts_status ON public.render_attempts(status, claimed_at);
ALTER TABLE public.render_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.render_attempts TO authenticated;
GRANT ALL ON public.render_attempts TO service_role;
DROP POLICY IF EXISTS "users select own render attempts" ON public.render_attempts;
CREATE POLICY "users select own render attempts" ON public.render_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.upload_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_item_id uuid NOT NULL REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'youtube',
  provider_upload_ref text,
  youtube_video_id text,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','uploading','completed','failed','abandoned')),
  error_message text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  worker_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_upload_attempts_item_created ON public.upload_attempts(campaign_item_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_attempts_status ON public.upload_attempts(status, claimed_at);
ALTER TABLE public.upload_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.upload_attempts TO authenticated;
GRANT ALL ON public.upload_attempts TO service_role;
DROP POLICY IF EXISTS "users select own upload attempts" ON public.upload_attempts;
CREATE POLICY "users select own upload attempts" ON public.upload_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Active-attempt references make callbacks/reclaims compare-and-set operations.
ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS active_render_attempt_id uuid REFERENCES public.render_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_upload_attempt_id uuid REFERENCES public.upload_attempts(id) ON DELETE SET NULL;

-- 4) Atomic queue claims. Candidate discovery may race; these functions cannot.
CREATE OR REPLACE FUNCTION public.claim_render_item(
  p_item_id uuid,
  p_worker_id text,
  p_idempotency_key text
) RETURNS TABLE(attempt_id uuid, user_id uuid, campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.campaign_items%ROWTYPE;
  v_attempt uuid;
BEGIN
  SELECT * INTO v_item FROM public.campaign_items
  WHERE id = p_item_id
    AND status IN ('pending','upload_pending')
    AND rendered_video_url IS NULL
    AND active_render_attempt_id IS NULL
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.render_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;

  UPDATE public.campaign_items
  SET status='rendering', error_message=NULL, render_provider='shotstack',
      render_submitted_at=now(), active_render_attempt_id=v_attempt
  WHERE id=v_item.id;

  RETURN QUERY SELECT v_attempt, v_item.user_id, v_item.campaign_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_render_item(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_render_item(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_upload_item(
  p_item_id uuid,
  p_worker_id text,
  p_idempotency_key text
) RETURNS TABLE(attempt_id uuid, user_id uuid, campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.campaign_items%ROWTYPE;
  v_attempt uuid;
  v_existing_video text;
BEGIN
  SELECT youtube_video_id INTO v_existing_video FROM public.upload_attempts
  WHERE campaign_item_id = p_item_id AND youtube_video_id IS NOT NULL
  ORDER BY claimed_at DESC LIMIT 1;
  IF v_existing_video IS NOT NULL THEN
    UPDATE public.campaign_items
    SET status='uploaded', youtube_video_id=v_existing_video,
        youtube_url='https://youtube.com/shorts/' || v_existing_video,
        active_upload_attempt_id=NULL, error_message=NULL
    WHERE id=p_item_id AND youtube_video_id IS NULL;
    RETURN;
  END IF;

  SELECT * INTO v_item FROM public.campaign_items
  WHERE id = p_item_id
    AND status IN ('pending','rendered','upload_pending')
    AND rendered_video_url IS NOT NULL
    AND active_upload_attempt_id IS NULL
    AND youtube_video_id IS NULL
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.upload_attempts(campaign_item_id,user_id,campaign_id,idempotency_key,worker_id)
  VALUES(v_item.id,v_item.user_id,v_item.campaign_id,p_idempotency_key,p_worker_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_attempt;
  IF v_attempt IS NULL THEN RETURN; END IF;

  UPDATE public.campaign_items
  SET status='uploading', error_message=NULL, active_upload_attempt_id=v_attempt
  WHERE id=v_item.id;

  RETURN QUERY SELECT v_attempt, v_item.user_id, v_item.campaign_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_upload_item(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upload_item(uuid,text,text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_campaign_items_render_queue
ON public.campaign_items(status, render_due_at, schedule_at)
WHERE rendered_video_url IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_items_upload_queue
ON public.campaign_items(status, upload_due_at, schedule_at)
WHERE rendered_video_url IS NOT NULL AND youtube_video_id IS NULL;
