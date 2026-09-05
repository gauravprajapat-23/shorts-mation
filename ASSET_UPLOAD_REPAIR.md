# Asset Upload Repair

## Root cause

All asset uploads use `uploadDurableAsset()` from `src/lib/asset-client.ts`.
Before sending the file to Supabase Storage it calls `asset_storage_usage(uuid)`.
A later hardening migration revoked authenticated execution of that function, so every upload entry point failed through the same shared helper:

- Assets screen
- Editor media upload
- Brand logo / watermark upload
- Audio upload
- Mobile editor upload

The same hardening migration also revoked the ownership-scoped `replace_asset_everywhere()` and `list_unused_asset_candidates()` RPCs used on the Assets screen.

## Fixes

- Added migration `20260905124500_fix_asset_upload_permissions_and_bucket.sql`.
- Ensures the private `assets` bucket exists.
- Rebuilds per-user `storage.objects` policies using `auth.uid()` folder ownership.
- Restores authenticated access to `asset_storage_usage(uuid)`; the function itself rejects requests for another user's id.
- Restores authenticated access only to the already ownership-scoped `replace_asset_everywhere()` and `list_unused_asset_candidates()` functions.
- Keeps anon/PUBLIC denied.
- Keeps `public.assets` table RLS ownership policy explicit.
- Added a client fallback for quota display when an older database has not yet applied the permission migration. The database quota trigger remains authoritative.
- Improved upload errors for missing buckets, RLS/permission problems, file-size failures, session failures and empty files.
- Added editor upload error toasts for brand, audio and mobile uploads so failures are no longer silent.

## Important deployment step

Apply the new Supabase/Lovable Cloud database migration. The client fallback prevents the old quota-RPC revoke from blocking uploads, but Storage bucket/RLS configuration is database-side and must be deployed.

## Verification

- `npm run integrity` — PASS, 222 TS/TSX files, 0 unresolved internal imports.
- `npm run integrity:migrations` — PASS, 36 migrations, unique ordering.
- Added `src/integration/asset-upload-permissions.integration.test.ts`.
