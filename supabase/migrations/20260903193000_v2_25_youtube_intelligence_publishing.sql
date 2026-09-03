-- V2.25 — YouTube Intelligence & Publishing
ALTER TABLE public.youtube_connections
  ADD COLUMN IF NOT EXISTS audience_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS upload_defaults_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analytics_last_synced_at timestamptz;

ALTER TABLE public.campaign_items
  ADD COLUMN IF NOT EXISTS youtube_thumbnail_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS youtube_last_reconciled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.youtube_channel_snapshots (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.youtube_connections(id) ON DELETE CASCADE,
  subscribers bigint,
  views bigint,
  videos bigint,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_youtube_channel_snapshots_connection ON public.youtube_channel_snapshots(connection_id,captured_at DESC);
ALTER TABLE public.youtube_channel_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.youtube_channel_snapshots TO authenticated;
GRANT ALL ON public.youtube_channel_snapshots TO service_role;
CREATE POLICY "users read own youtube channel snapshots" ON public.youtube_channel_snapshots FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.youtube_video_performance (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.youtube_connections(id) ON DELETE CASCADE,
  campaign_item_id uuid REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  youtube_video_id text NOT NULL,
  views bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  estimated_minutes_watched numeric,
  average_view_duration_seconds numeric,
  subscribers_gained bigint,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_youtube_video_performance_item ON public.youtube_video_performance(campaign_item_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_video_performance_video ON public.youtube_video_performance(youtube_video_id,captured_at DESC);
ALTER TABLE public.youtube_video_performance ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.youtube_video_performance TO authenticated;
GRANT ALL ON public.youtube_video_performance TO service_role;
CREATE POLICY "users read own youtube performance" ON public.youtube_video_performance FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.youtube_publish_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  title_template text NOT NULL DEFAULT '{{title}}',
  description_template text NOT NULL DEFAULT '{{description}}',
  hashtag_rules_json jsonb NOT NULL DEFAULT '{"max":5,"append":true}'::jsonb,
  language text,
  category_id text,
  playlist_id text,
  privacy text NOT NULL DEFAULT 'private' CHECK(privacy IN ('private','unlisted','public')),
  made_for_kids boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.youtube_publish_presets ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.youtube_publish_presets TO authenticated;
GRANT ALL ON public.youtube_publish_presets TO service_role;
CREATE POLICY "users manage own youtube publish presets" ON public.youtube_publish_presets FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
