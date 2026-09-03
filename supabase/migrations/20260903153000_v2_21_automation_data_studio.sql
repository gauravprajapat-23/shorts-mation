-- V2.21 — Automation Data Studio
CREATE TABLE IF NOT EXISTS public.automation_data_studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled data studio',
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  youtube_connection_id uuid REFERENCES public.youtube_connections(id) ON DELETE SET NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  columns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_generated_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_data_studios_user_updated
  ON public.automation_data_studios(user_id, updated_at DESC);

ALTER TABLE public.automation_data_studios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_data_studios TO authenticated;
GRANT ALL ON public.automation_data_studios TO service_role;

DROP POLICY IF EXISTS "users manage own automation data studios" ON public.automation_data_studios;
CREATE POLICY "users manage own automation data studios"
ON public.automation_data_studios FOR ALL TO authenticated
USING (auth.uid()=user_id)
WITH CHECK (
  auth.uid()=user_id
  AND (template_id IS NULL OR EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id=template_id AND (t.user_id=auth.uid() OR t.is_default=true OR t.visibility='public')
  ))
  AND (youtube_connection_id IS NULL OR EXISTS (
    SELECT 1 FROM public.youtube_connections yc
    WHERE yc.id=youtube_connection_id AND yc.user_id=auth.uid()
  ))
);

CREATE OR REPLACE FUNCTION public.touch_automation_data_studio()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_automation_data_studio_updated ON public.automation_data_studios;
CREATE TRIGGER trg_automation_data_studio_updated
BEFORE UPDATE ON public.automation_data_studios
FOR EACH ROW EXECUTE FUNCTION public.touch_automation_data_studio();

CREATE OR REPLACE FUNCTION public.mark_data_studio_generated(
  p_studio_id uuid,
  p_campaign_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.automation_data_studios
  SET last_generated_campaign_id=p_campaign_id, updated_at=now()
  WHERE id=p_studio_id AND user_id=auth.uid()
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id=p_campaign_id AND c.user_id=auth.uid());
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mark_data_studio_generated(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_data_studio_generated(uuid,uuid) TO authenticated;
