-- V2.17 Durable Media & Asset Architecture
-- Durable asset identity, deduplication, quotas, usage tracking and replacement.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_lifecycle_status_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_lifecycle_status_check
  CHECK (lifecycle_status IN ('active','orphaned','missing'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_user_content_hash
  ON public.assets(user_id, content_hash)
  WHERE content_hash IS NOT NULL AND lifecycle_status = 'active';
CREATE INDEX IF NOT EXISTS idx_assets_user_lifecycle ON public.assets(user_id, lifecycle_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_storage_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_bytes BIGINT NOT NULL DEFAULT 5368709120 CHECK (quota_bytes >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_storage_quotas TO authenticated;
GRANT ALL ON public.user_storage_quotas TO service_role;
ALTER TABLE public.user_storage_quotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own storage quota" ON public.user_storage_quotas;
CREATE POLICY "users read own storage quota" ON public.user_storage_quotas FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.asset_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.templates(id) ON DELETE CASCADE,
  campaign_item_id UUID REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'template',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, template_id, location)
);
CREATE INDEX IF NOT EXISTS idx_asset_usages_user_asset ON public.asset_usages(user_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_usages_template ON public.asset_usages(template_id);
CREATE INDEX IF NOT EXISTS idx_asset_usages_campaign_item ON public.asset_usages(campaign_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_usages_campaign_unique ON public.asset_usages(asset_id, campaign_item_id, location) WHERE campaign_item_id IS NOT NULL;
GRANT SELECT ON public.asset_usages TO authenticated;
GRANT ALL ON public.asset_usages TO service_role;
ALTER TABLE public.asset_usages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own asset usages" ON public.asset_usages;
CREATE POLICY "users read own asset usages" ON public.asset_usages FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.asset_storage_usage(p_user_id UUID)
RETURNS TABLE(used_bytes BIGINT, quota_bytes BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT
    COALESCE((SELECT SUM(COALESCE(a.size,0)) FROM public.assets a WHERE a.user_id = p_user_id AND a.lifecycle_status = 'active'),0)::BIGINT,
    COALESCE((SELECT q.quota_bytes FROM public.user_storage_quotas q WHERE q.user_id = p_user_id),5368709120)::BIGINT;
END $$;
REVOKE ALL ON FUNCTION public.asset_storage_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asset_storage_usage(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_asset_storage_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_bytes BIGINT; max_bytes BIGINT;
BEGIN
  SELECT used_bytes, quota_bytes INTO current_bytes, max_bytes FROM public.asset_storage_usage(NEW.user_id);
  IF TG_OP = 'UPDATE' AND OLD.lifecycle_status = 'active' THEN current_bytes := GREATEST(0, current_bytes - COALESCE(OLD.size,0)); END IF;
  IF current_bytes + COALESCE(NEW.size,0) > max_bytes THEN
    RAISE EXCEPTION 'Storage quota exceeded (% of % bytes used)', current_bytes, max_bytes USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assets_storage_quota ON public.assets;
CREATE TRIGGER trg_assets_storage_quota BEFORE INSERT OR UPDATE OF size,user_id,lifecycle_status ON public.assets
FOR EACH ROW WHEN (NEW.lifecycle_status = 'active') EXECUTE FUNCTION public.enforce_asset_storage_quota();

CREATE OR REPLACE FUNCTION public.refresh_asset_usage_count(p_asset_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.assets a SET
    usage_count = (SELECT COUNT(*)::INTEGER FROM public.asset_usages u WHERE u.asset_id = p_asset_id),
    last_used_at = CASE WHEN EXISTS (SELECT 1 FROM public.asset_usages u WHERE u.asset_id = p_asset_id) THEN now() ELSE a.last_used_at END
  WHERE a.id = p_asset_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_template_asset_usages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref TEXT; aid UUID;
BEGIN
  DELETE FROM public.asset_usages WHERE template_id = NEW.id;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  FOR ref IN
    SELECT DISTINCT m[1]
    FROM regexp_matches(NEW.template_json::text, 'asset://([0-9a-fA-F-]{36})', 'g') AS m
  LOOP
    BEGIN aid := ref::UUID; EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    INSERT INTO public.asset_usages(user_id, asset_id, template_id, location)
    SELECT NEW.user_id, a.id, NEW.id, 'template'
    FROM public.assets a WHERE a.id = aid AND a.user_id = NEW.user_id
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_templates_sync_asset_usages ON public.templates;
CREATE TRIGGER trg_templates_sync_asset_usages AFTER INSERT OR UPDATE OF template_json ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.sync_template_asset_usages();

CREATE OR REPLACE FUNCTION public.sync_campaign_item_asset_usages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref TEXT; aid UUID; payload TEXT;
BEGIN
  DELETE FROM public.asset_usages WHERE campaign_item_id = NEW.id;
  payload := COALESCE(NEW.content_json,'{}'::jsonb)::text || COALESCE(NEW.asset_json,'{}'::jsonb)::text || COALESCE(NEW.audio_json,'{}'::jsonb)::text;
  FOR ref IN SELECT DISTINCT m[1] FROM regexp_matches(payload, 'asset://([0-9a-fA-F-]{36})', 'g') AS m LOOP
    BEGIN aid := ref::UUID; EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    INSERT INTO public.asset_usages(user_id, asset_id, campaign_item_id, location)
    SELECT NEW.user_id, a.id, NEW.id, 'campaign_item' FROM public.assets a WHERE a.id=aid AND a.user_id=NEW.user_id
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campaign_items_sync_asset_usages ON public.campaign_items;
CREATE TRIGGER trg_campaign_items_sync_asset_usages AFTER INSERT OR UPDATE OF content_json,asset_json,audio_json ON public.campaign_items
FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_item_asset_usages();

CREATE OR REPLACE FUNCTION public.refresh_asset_usage_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN PERFORM public.refresh_asset_usage_count(OLD.asset_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM public.refresh_asset_usage_count(NEW.asset_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_asset_usages_refresh_count ON public.asset_usages;
CREATE TRIGGER trg_asset_usages_refresh_count AFTER INSERT OR UPDATE OR DELETE ON public.asset_usages
FOR EACH ROW EXECUTE FUNCTION public.refresh_asset_usage_after_change();

-- Convert legacy persisted signed URLs that exactly match an owned asset row
-- into durable asset:// identities before rebuilding usage indexes.
DO $$
DECLARE a RECORD;
BEGIN
  FOR a IN SELECT id, user_id, file_url FROM public.assets WHERE storage_path IS NOT NULL AND file_url IS NOT NULL LOOP
    IF a.file_url <> '' AND a.file_url NOT LIKE 'asset://%' THEN
      UPDATE public.templates
      SET template_json = replace(template_json::text, a.file_url, 'asset://' || a.id::text)::jsonb
      WHERE user_id = a.user_id AND template_json::text LIKE '%' || a.file_url || '%';
    END IF;
    UPDATE public.assets SET file_url = 'asset://' || a.id::text WHERE id = a.id;
  END LOOP;
END $$;

-- Re-sync existing templates after deploying the durable-reference migration.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT id FROM public.templates LOOP
    UPDATE public.templates SET template_json = template_json WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.campaign_items LOOP
    UPDATE public.campaign_items SET content_json=content_json, asset_json=asset_json, audio_json=audio_json WHERE id=r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.replace_asset_everywhere(p_old_asset UUID, p_new_asset UUID)
RETURNS TABLE(templates_updated INTEGER, campaign_items_updated INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); old_uri TEXT; new_uri TEXT; t_count INTEGER := 0; c_count INTEGER := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id=p_old_asset AND user_id=uid) OR
     NOT EXISTS (SELECT 1 FROM public.assets WHERE id=p_new_asset AND user_id=uid AND lifecycle_status='active') THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;
  old_uri := 'asset://' || p_old_asset::text; new_uri := 'asset://' || p_new_asset::text;
  UPDATE public.templates SET template_json = replace(replace(template_json::text, old_uri, new_uri), p_old_asset::text, p_new_asset::text)::jsonb
    WHERE user_id=uid AND template_json::text LIKE '%' || p_old_asset::text || '%';
  GET DIAGNOSTICS t_count = ROW_COUNT;
  UPDATE public.campaign_items SET
    content_json = replace(content_json::text, old_uri, new_uri)::jsonb,
    asset_json = replace(asset_json::text, old_uri, new_uri)::jsonb,
    audio_json = replace(audio_json::text, old_uri, new_uri)::jsonb
    WHERE user_id=uid AND (content_json::text LIKE '%'||p_old_asset::text||'%' OR asset_json::text LIKE '%'||p_old_asset::text||'%' OR audio_json::text LIKE '%'||p_old_asset::text||'%');
  GET DIAGNOSTICS c_count = ROW_COUNT;
  RETURN QUERY SELECT t_count, c_count;
END $$;
REVOKE ALL ON FUNCTION public.replace_asset_everywhere(UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_asset_everywhere(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_unused_asset_candidates(p_older_than_days INTEGER DEFAULT 7)
RETURNS TABLE(id UUID, storage_path TEXT, size BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.storage_path, a.size
  FROM public.assets a
  WHERE a.user_id = auth.uid()
    AND a.lifecycle_status = 'active'
    AND a.created_at < now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_older_than_days,7),365)))
    AND NOT EXISTS (SELECT 1 FROM public.asset_usages u WHERE u.asset_id = a.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.campaign_items ci
      WHERE ci.user_id = a.user_id
        AND (ci.content_json::text LIKE '%'||a.id::text||'%' OR ci.asset_json::text LIKE '%'||a.id::text||'%' OR ci.audio_json::text LIKE '%'||a.id::text||'%')
    );
$$;
REVOKE ALL ON FUNCTION public.list_unused_asset_candidates(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unused_asset_candidates(INTEGER) TO authenticated;
