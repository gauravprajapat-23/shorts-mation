-- Repair Automation Data Studio campaign RPC permissions.
-- A later hardening migration revoked these user-owned SECURITY DEFINER RPCs
-- from authenticated, causing "permission denied for function
-- create_campaign_with_items".

CREATE OR REPLACE FUNCTION public.create_campaign_with_items(
  p_campaign jsonb,
  p_items jsonb
) RETURNS TABLE(campaign_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campaign uuid;
  v_count integer;
  v_template uuid;
  v_youtube_connection uuid;
  v_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'items must be an array'; END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 5000 THEN RAISE EXCEPTION 'campaign must contain 1-5000 items'; END IF;

  v_name := btrim(COALESCE(p_campaign->>'name',''));
  IF v_name = '' THEN RAISE EXCEPTION 'campaign name is required'; END IF;

  BEGIN
    v_template := NULLIF(p_campaign->>'template_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid template id';
  END;

  IF v_template IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.templates t
    WHERE t.id=v_template
      AND (t.user_id=v_user OR (t.visibility='public' AND t.published_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'template is not accessible';
  END IF;

  BEGIN
    v_youtube_connection := NULLIF(p_campaign->>'youtube_connection_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid YouTube connection id';
  END;

  IF v_youtube_connection IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.youtube_connections yc
    WHERE yc.id=v_youtube_connection AND yc.user_id=v_user
  ) THEN
    RAISE EXCEPTION 'YouTube connection is not owned by this account';
  END IF;

  INSERT INTO public.campaigns(
    user_id,youtube_connection_id,name,template_id,status,timezone,total_videos,settings_json
  ) VALUES (
    v_user,v_youtube_connection,v_name,v_template,
    COALESCE(NULLIF(p_campaign->>'status','')::public.campaign_status,'draft'::public.campaign_status),
    COALESCE(NULLIF(p_campaign->>'timezone',''),'UTC'),
    v_count,COALESCE(p_campaign->'settings_json','{}'::jsonb)
  ) RETURNING id INTO v_campaign;

  INSERT INTO public.campaign_items(
    campaign_id,user_id,video_file_name,content_json,seo_json,youtube_settings_json,
    audio_json,asset_json,status,schedule_at
  )
  SELECT
    v_campaign,v_user,
    COALESCE(NULLIF(btrim(i->>'video_file_name'),''),'video-'||substr(gen_random_uuid()::text,1,8)||'.mp4'),
    COALESCE(i->'content_json','{}'::jsonb),
    COALESCE(i->'seo_json','{}'::jsonb),
    COALESCE(i->'youtube_settings_json','{}'::jsonb),
    COALESCE(i->'audio_json','{}'::jsonb),
    COALESCE(i->'asset_json','{}'::jsonb),
    'pending'::public.item_status,
    CASE WHEN NULLIF(i->>'schedule_at','') IS NULL THEN NULL ELSE (i->>'schedule_at')::timestamptz END
  FROM jsonb_array_elements(p_items) AS q(i);

  RETURN QUERY SELECT v_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.create_campaign_with_items(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_campaign_with_items(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_data_studio_generated(
  p_studio_id uuid,p_campaign_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.automation_data_studios
  SET last_generated_campaign_id=p_campaign_id,updated_at=now()
  WHERE id=p_studio_id AND user_id=v_user
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id=p_campaign_id AND c.user_id=v_user
    );
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.mark_data_studio_generated(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_data_studio_generated(uuid,uuid) TO authenticated;
