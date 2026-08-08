CREATE OR REPLACE FUNCTION public.recount_campaign_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cid uuid;
BEGIN
  cid := COALESCE(NEW.campaign_id, OLD.campaign_id);
  UPDATE public.campaigns c SET
    uploaded_count = s.uploaded,
    failed_count = s.failed,
    scheduled_count = s.scheduled,
    generated_count = s.generated,
    total_videos = s.total,
    updated_at = now()
  FROM (
    SELECT
      count(*) FILTER (WHERE status = 'uploaded') AS uploaded,
      count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE status = 'scheduled') AS scheduled,
      count(*) FILTER (WHERE rendered_video_url IS NOT NULL) AS generated,
      count(*) AS total
    FROM public.campaign_items WHERE campaign_id = cid
  ) s
  WHERE c.id = cid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS campaign_items_recount ON public.campaign_items;
CREATE TRIGGER campaign_items_recount
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_items
FOR EACH ROW EXECUTE FUNCTION public.recount_campaign_progress();

UPDATE public.campaigns c SET
  uploaded_count = s.uploaded,
  failed_count = s.failed,
  scheduled_count = s.scheduled,
  generated_count = s.generated,
  total_videos = s.total
FROM (
  SELECT campaign_id,
    count(*) FILTER (WHERE status = 'uploaded') AS uploaded,
    count(*) FILTER (WHERE status = 'failed') AS failed,
    count(*) FILTER (WHERE status = 'scheduled') AS scheduled,
    count(*) FILTER (WHERE rendered_video_url IS NOT NULL) AS generated,
    count(*) AS total
  FROM public.campaign_items GROUP BY campaign_id
) s
WHERE c.id = s.campaign_id;

UPDATE public.campaign_items
SET status = 'pending', render_job_ref = NULL, render_submitted_at = NULL
WHERE status = 'rendering' AND rendered_video_url IS NULL AND render_job_ref IS NULL;