ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_items REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;