ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS render_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS upload_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_provider text,
  ADD COLUMN IF NOT EXISTS render_job_ref text,
  ADD COLUMN IF NOT EXISTS render_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_publish_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_campaign_item_leads()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_at IS NULL THEN
    NEW.render_due_at := NULL;
    NEW.upload_due_at := NULL;
  ELSE
    NEW.render_due_at := NEW.schedule_at - interval '60 minutes';
    NEW.upload_due_at := NEW.schedule_at - interval '20 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_leads ON public.campaign_items;
CREATE TRIGGER trg_items_leads
BEFORE INSERT OR UPDATE OF schedule_at ON public.campaign_items
FOR EACH ROW EXECUTE FUNCTION public.set_campaign_item_leads();

UPDATE public.campaign_items
SET render_due_at = schedule_at - interval '60 minutes',
    upload_due_at = schedule_at - interval '20 minutes'
WHERE schedule_at IS NOT NULL AND render_due_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_items_render_due ON public.campaign_items (render_due_at) WHERE rendered_video_url IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_items_upload_due ON public.campaign_items (upload_due_at);