# V2.17 — Durable Media & Asset Architecture

## Core durable-reference model

- `src/lib/types.ts`
  - Added durable asset identity fields to image/video/audio layers and brand media.
- `src/lib/asset-refs.ts`
  - `asset://<uuid>` URI convention.
  - document normalization before persistence/export.
  - fresh URL hydration while preserving identity.
  - legacy signed-URL storage-path recovery.
  - reusable-component, brand, scene, V1 audio and V2 audio support.
  - missing-reference and replace helpers.
- `src/lib/asset-client.ts`
  - SHA-256 upload deduplication.
  - quota preflight.
  - durable asset registration.
  - one-hour browser preview URL signing.
  - legacy URL recovery and fresh hydration.
- `src/lib/asset-refs.server.ts`
  - server-side six-hour signing for render jobs.
  - missing/inactive asset rejection at the render boundary.
  - legacy signed-URL recovery.

## Database and lifecycle

- `supabase/migrations/20260903113000_v2_17_durable_asset_architecture.sql`
  - `assets.content_hash`, `lifecycle_status`, `usage_count`, `last_used_at`.
  - unique per-user content hash for active assets.
  - per-user storage quotas (default 5 GiB, overrideable by service/admin).
  - DB quota enforcement trigger.
  - `asset_usages` index for template and campaign-item references.
  - automatic usage synchronization triggers.
  - legacy persisted signed URL conversion to `asset://` where recoverable.
  - `replace_asset_everywhere()` authenticated RPC.
  - `list_unused_asset_candidates()` guarded cleanup RPC.
- `src/integrations/supabase/types.ts`
  - generated-type compatibility for new asset columns.

## Editor/template/runtime integration

- `src/routes/_app/editor/$templateId.tsx`
  - durable uploads instead of year-long signed URLs.
  - fresh asset hydration on editor load.
  - durable normalization on Save.
  - durable brand-kit storage + re-sign on apply.
  - durable reusable-component storage + re-sign on insertion.
  - uploaded image/video/audio elements retain asset identity.
- `src/lib/template-io.ts`
  - exports normalize owned media to durable refs instead of exporting signed URLs.
- `src/routes/_app/campaigns/$campaignId.test-render.tsx`
  - Test Render hydrates durable refs before browser preview/export.
- `src/lib/render-pipeline.server.ts`
  - unattended production render resolves durable refs to fresh server URLs.
  - filename fallback only uses active assets.
- `src/lib/render-jobs.functions.ts`
  - browser/server test jobs use the same durable resolver.
- `src/lib/youtube-upload.functions.ts`
  - fallback asset lookup ignores inactive/missing assets.

## Asset operations UI

- `src/routes/_app/assets.tsx`
  - storage quota meter.
  - deduplicated upload feedback.
  - usage counts.
  - missing storage-object detection.
  - missing template-reference detection.
  - replace-asset-everywhere workflow.
  - delete guard for referenced media.
  - guarded unused-media cleanup.
  - true unregistered Storage-object orphan cleanup with grace period.
- `src/lib/asset-management.functions.ts`
  - safe deletion lifecycle.
  - unused DB asset cleanup.
  - true Storage orphan cleanup.
- `src/lib/mcp/tools/list-assets.ts`
  - exposes durable asset health/usage metadata.

## Verification

- `src/lib/asset-refs.test.ts`
  - normalization, hydration, missing refs, replacement, reusable components, legacy audio.
- `src/integration/v2-17-durable-assets.integration.test.ts`
  - template/campaign usage indexing.
  - atomic replace-everywhere.
  - database storage-quota enforcement.
- `scripts/check-migrations.mjs`
  - V2.17 migration invariants added to release integrity check.
