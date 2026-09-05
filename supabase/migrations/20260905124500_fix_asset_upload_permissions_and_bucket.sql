-- V2.26.x — Restore asset upload functionality across Assets + Editor.
-- A security-hardening migration revoked authenticated execution of
-- asset_storage_usage(uuid), but the shared browser uploader calls that RPC
-- before every upload. The function is safe for authenticated execution because
-- it explicitly rejects p_user_id values other than auth.uid().

-- Ensure the private assets bucket exists. This is idempotent and keeps uploads
-- scoped through storage.objects RLS policies below.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('assets', 'assets', false, 536870912)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

-- Restore only the safe read-only quota RPC needed by browser uploads.
REVOKE ALL ON FUNCTION public.asset_storage_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asset_storage_usage(uuid) TO authenticated, service_role;

-- Rebuild bucket policies idempotently so all screens share the same valid
-- user-folder contract: assets/<auth.uid()>/<content-hash>.<ext>
DROP POLICY IF EXISTS "user read own assets" ON storage.objects;
DROP POLICY IF EXISTS "user write own assets" ON storage.objects;
DROP POLICY IF EXISTS "user update own assets" ON storage.objects;
DROP POLICY IF EXISTS "user delete own assets" ON storage.objects;

CREATE POLICY "user read own assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "user write own assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "user update own assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "user delete own assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Preserve table-level ownership rules as an explicit invariant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
DROP POLICY IF EXISTS "users manage own assets" ON public.assets;
CREATE POLICY "users manage own assets"
ON public.assets FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- The same hardening migration also revoked two Assets-screen RPCs that are
-- already ownership-scoped internally. Restore only these safe user functions.
REVOKE ALL ON FUNCTION public.replace_asset_everywhere(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_asset_everywhere(uuid,uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_unused_asset_candidates(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_unused_asset_candidates(integer) TO authenticated, service_role;
