-- V2.20 — Template Marketplace & Template Builder UX
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  ADD COLUMN IF NOT EXISTS preview_video_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS documentation text,
  ADD COLUMN IF NOT EXISTS validation_score integer NOT NULL DEFAULT 0 CHECK (validation_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS required_variables text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS remix_of uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1);

CREATE INDEX IF NOT EXISTS idx_templates_marketplace
  ON public.templates(visibility, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_tags ON public.templates USING gin(tags);

CREATE TABLE IF NOT EXISTS public.template_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, template_id)
);
ALTER TABLE public.template_favorites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.template_favorites TO authenticated;
GRANT ALL ON public.template_favorites TO service_role;
DROP POLICY IF EXISTS "users read own template favorites" ON public.template_favorites;
CREATE POLICY "users read own template favorites" ON public.template_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users add own template favorites" ON public.template_favorites;
CREATE POLICY "users add own template favorites" ON public.template_favorites
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id=template_id AND (t.user_id=auth.uid() OR t.is_default=true OR t.visibility='public')
    )
  );
DROP POLICY IF EXISTS "users delete own template favorites" ON public.template_favorites;
CREATE POLICY "users delete own template favorites" ON public.template_favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  aspect_ratio text NOT NULL,
  template_json jsonb NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_template_versions_template ON public.template_versions(template_id, version_number DESC);
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.template_versions TO authenticated;
GRANT ALL ON public.template_versions TO service_role;
DROP POLICY IF EXISTS "users read accessible template versions" ON public.template_versions;
CREATE POLICY "users read accessible template versions" ON public.template_versions
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id=template_id AND (t.user_id=auth.uid() OR t.is_default=true OR t.visibility='public')
  )
);

DROP POLICY IF EXISTS "users select own or default templates" ON public.templates;
CREATE POLICY "users select accessible templates" ON public.templates
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_default = true OR visibility = 'public');

-- Keep private users from escalating into built-in defaults while allowing
-- them to publish/unpublish their own marketplace templates.
DROP POLICY IF EXISTS "users update own private templates" ON public.templates;
CREATE POLICY "users update own marketplace templates" ON public.templates
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND is_default = false)
WITH CHECK (auth.uid() = user_id AND is_default = false);

CREATE OR REPLACE FUNCTION public.snapshot_template_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE next_version integer;
BEGIN
  IF TG_OP='UPDATE' AND (
    OLD.template_json IS DISTINCT FROM NEW.template_json OR
    OLD.name IS DISTINCT FROM NEW.name OR
    OLD.type IS DISTINCT FROM NEW.type
  ) THEN
    next_version := OLD.version_number + 1;
    INSERT INTO public.template_versions(
      template_id, owner_user_id, version_number, name, type, aspect_ratio,
      template_json, metadata_json
    ) VALUES (
      OLD.id, OLD.user_id, OLD.version_number, OLD.name, OLD.type, OLD.aspect_ratio,
      OLD.template_json,
      jsonb_build_object(
        'category', OLD.category, 'tags', OLD.tags, 'description', OLD.description,
        'documentation', OLD.documentation, 'thumbnail_url', OLD.thumbnail_url,
        'preview_video_url', OLD.preview_video_url, 'visibility', OLD.visibility,
        'validation_score', OLD.validation_score, 'required_variables', OLD.required_variables
      )
    ) ON CONFLICT (template_id, version_number) DO NOTHING;
    NEW.version_number := next_version;
  END IF;
  IF NEW.visibility='public' AND OLD.visibility IS DISTINCT FROM 'public' THEN
    NEW.published_at := now();
  ELSIF NEW.visibility='private' THEN
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_template_version_snapshot ON public.templates;
CREATE TRIGGER trg_template_version_snapshot
BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.snapshot_template_version();

CREATE OR REPLACE FUNCTION public.remix_template(p_template_id uuid, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src public.templates%ROWTYPE; new_id uuid;
BEGIN
  SELECT * INTO src FROM public.templates
  WHERE id=p_template_id
    AND (user_id=auth.uid() OR is_default=true OR visibility='public');
  IF NOT FOUND THEN RAISE EXCEPTION 'template not available'; END IF;

  INSERT INTO public.templates(
    user_id,name,type,aspect_ratio,template_json,thumbnail_url,category,tags,
    visibility,preview_video_url,description,documentation,validation_score,
    required_variables,remix_of,is_default
  ) VALUES (
    auth.uid(), COALESCE(NULLIF(trim(p_name),''), src.name || ' — Remix'),
    src.type,src.aspect_ratio,src.template_json,src.thumbnail_url,src.category,src.tags,
    'private',src.preview_video_url,src.description,src.documentation,src.validation_score,
    src.required_variables,src.id,false
  ) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.remix_template(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remix_template(uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.restore_template_version(p_template_id uuid, p_version_number integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap public.template_versions%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id=p_template_id AND t.user_id=auth.uid() AND t.is_default=false
  ) THEN
    RAISE EXCEPTION 'template not owned by current user';
  END IF;
  SELECT * INTO snap FROM public.template_versions
  WHERE template_id=p_template_id AND version_number=p_version_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'template version not found'; END IF;

  UPDATE public.templates
  SET name=snap.name,
      type=snap.type,
      aspect_ratio=snap.aspect_ratio,
      template_json=snap.template_json,
      category=COALESCE(snap.metadata_json->>'category', category),
      tags=CASE WHEN jsonb_typeof(snap.metadata_json->'tags')='array'
        THEN ARRAY(SELECT jsonb_array_elements_text(snap.metadata_json->'tags'))
        ELSE tags END,
      description=COALESCE(snap.metadata_json->>'description', description),
      documentation=COALESCE(snap.metadata_json->>'documentation', documentation),
      thumbnail_url=COALESCE(snap.metadata_json->>'thumbnail_url', thumbnail_url),
      preview_video_url=COALESCE(snap.metadata_json->>'preview_video_url', preview_video_url)
  WHERE id=p_template_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.restore_template_version(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_template_version(uuid,integer) TO authenticated;
