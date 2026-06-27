
-- Policies for assets, renders, thumbnails buckets: per-user folder access
DO $$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['assets','renders','thumbnails'] LOOP
    EXECUTE format($pol$
      CREATE POLICY "user read own %1$s" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text);
    $pol$, b);
    EXECUTE format($pol$
      CREATE POLICY "user write own %1$s" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text);
    $pol$, b);
    EXECUTE format($pol$
      CREATE POLICY "user update own %1$s" ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text);
    $pol$, b);
    EXECUTE format($pol$
      CREATE POLICY "user delete own %1$s" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = %1$L AND (storage.foldername(name))[1] = auth.uid()::text);
    $pol$, b);
  END LOOP;
END$$;
