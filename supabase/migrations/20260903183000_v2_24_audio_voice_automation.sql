-- V2.24 — Audio & Voice Automation
CREATE TABLE IF NOT EXISTS public.tts_providers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','elevenlabs')),
  api_key_encrypted text,
  model text NOT NULL,
  default_voice text,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,provider)
);
ALTER TABLE public.tts_providers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tts_providers FROM anon, authenticated;
GRANT ALL ON public.tts_providers TO service_role;

CREATE TABLE IF NOT EXISTS public.voice_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','elevenlabs')),
  model text NOT NULL,
  voice_id text NOT NULL,
  speed numeric NOT NULL DEFAULT 1 CHECK (speed BETWEEN 0.5 AND 2),
  style_instructions text,
  pronunciation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_presets_user ON public.voice_presets(user_id,updated_at DESC);
ALTER TABLE public.voice_presets ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.voice_presets TO authenticated;
GRANT ALL ON public.voice_presets TO service_role;
CREATE POLICY "users manage own voice presets" ON public.voice_presets FOR ALL TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.audio_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('music','voiceover','sfx','original')),
  volume numeric NOT NULL DEFAULT 1 CHECK (volume BETWEEN 0 AND 2),
  fade_in_ms integer NOT NULL DEFAULT 0 CHECK (fade_in_ms >= 0),
  fade_out_ms integer NOT NULL DEFAULT 0 CHECK (fade_out_ms >= 0),
  ducking boolean NOT NULL DEFAULT false,
  loop boolean NOT NULL DEFAULT false,
  bpm numeric,
  beat_offset_ms integer NOT NULL DEFAULT 0,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audio_presets ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.audio_presets TO authenticated;
GRANT ALL ON public.audio_presets TO service_role;
CREATE POLICY "users manage own audio presets" ON public.audio_presets FOR ALL TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.audio_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('music','sfx')),
  name text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  bpm numeric,
  beat_offset_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,asset_id)
);
ALTER TABLE public.audio_library_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.audio_library_items TO authenticated;
GRANT ALL ON public.audio_library_items TO service_role;
CREATE POLICY "users manage own audio library" ON public.audio_library_items FOR ALL TO authenticated
USING (
  user_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.assets a WHERE a.id=asset_id AND a.user_id=auth.uid() AND a.lifecycle_status='active')
)
WITH CHECK (
  user_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.assets a WHERE a.id=asset_id AND a.user_id=auth.uid() AND a.lifecycle_status='active')
);

CREATE TABLE IF NOT EXISTS public.tts_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  scene_id text,
  provider text NOT NULL CHECK (provider IN ('openai','elevenlabs')),
  model text NOT NULL,
  voice_id text NOT NULL,
  characters integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tts_generation_runs_user_created ON public.tts_generation_runs(user_id,created_at DESC);
ALTER TABLE public.tts_generation_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tts_generation_runs TO authenticated;
GRANT ALL ON public.tts_generation_runs TO service_role;
CREATE POLICY "users read own tts runs" ON public.tts_generation_runs FOR SELECT TO authenticated USING(user_id=auth.uid());
