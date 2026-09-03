-- V2.26 — Analytics & Winning-Template Intelligence
ALTER TABLE public.youtube_video_performance
  ADD COLUMN IF NOT EXISTS impressions bigint,
  ADD COLUMN IF NOT EXISTS ctr numeric,
  ADD COLUMN IF NOT EXISTS retention_proxy numeric,
  ADD COLUMN IF NOT EXISTS first_3s_proxy numeric,
  ADD COLUMN IF NOT EXISTS upload_time timestamptz,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hook text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS variant text,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_youtube_performance_template_time
  ON public.youtube_video_performance(template_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_performance_campaign_time
  ON public.youtube_video_performance(campaign_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_performance_upload_time
  ON public.youtube_video_performance(upload_time);

CREATE TABLE IF NOT EXISTS public.analytics_recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  basis_snapshot_at timestamptz NOT NULL DEFAULT now(),
  sample_size integer NOT NULL DEFAULT 0,
  best_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  best_upload_hour integer,
  best_hook text,
  recommendations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_recommendations_user_created
  ON public.analytics_recommendation_runs(user_id,created_at DESC);

ALTER TABLE public.analytics_recommendation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.analytics_recommendation_runs TO authenticated;
GRANT ALL ON public.analytics_recommendation_runs TO service_role;
CREATE POLICY "users read own analytics recommendations"
ON public.analytics_recommendation_runs FOR SELECT TO authenticated
USING(user_id=auth.uid());
