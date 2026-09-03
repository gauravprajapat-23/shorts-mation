# V2.16 — Production Workflow Consistency & Dynamic Render Repair

## Core workflow repairs

- `src/lib/render-materialization.ts`
  - canonical campaign automation input extraction
  - preserves arrays/objects instead of flattening them
  - one materialization boundary used by preview/test/server rendering
- `src/lib/render-pipeline.server.ts`
  - production Shotstack path now materializes V2.11 dynamic/conditional scenes and Half-Cut Any-Word templates before render payload generation
  - stale renders are reconciled with the provider before a second paid job can be created
- `src/lib/render-jobs.functions.ts`
  - test-render path uses the same materialization helper
  - adds trusted `attachBrowserRenderedOutput` server command so browser-rendered MP4s no longer directly mutate protected queue rows
- `src/routes/_app/campaigns/$campaignId.test-render.tsx`
  - structured automation input is preserved
  - dynamic scene index is clamped when switching rows
  - browser MP4 attachment goes through the server queue boundary and cleans up the uploaded object if attachment fails
- Removed legacy browser queue renderer:
  - `src/lib/auto-render.ts`
  - `src/components/auto-render-worker.tsx`
  - removed `AutoRenderWorker` from `src/routes/_app.tsx`

## Transactional campaign creation and scheduling

- `src/lib/schedule-generation.ts`
  - file schedule mode
  - `x_per_day` schedule generation
  - `daily_time` schedule generation
  - IANA timezone conversion
  - skip-weekends support
- `src/lib/campaign-create.functions.ts`
  - authenticated server entry point for transactional campaign creation
- `src/routes/_app/campaigns/new.tsx`
  - schedule rules now generate real `schedule_at` values
  - campaign + items are created through one RPC transaction
  - structured mapped values are preserved
- `supabase/migrations/20260902170000_v2_16_workflow_consistency.sql`
  - `create_campaign_with_items()` transaction RPC
  - activation requires a connected YouTube channel, at least one item, and every item scheduled
  - upload-attempt intended final state/publish time
  - scheduled-upload crash reconciliation
  - campaign completion reconciliation

## YouTube workflow repairs

- `src/lib/youtube-oauth.functions.ts`
  - redirect URI is derived from server `PUBLIC_APP_URL`
- `src/routes/api/public/youtube/callback.ts`
  - preserves the existing encrypted refresh token when Google omits `refresh_token` during reconnect
  - canonical callback/back origin uses server configuration
- `src/routes/_app/youtube-connect.tsx`
  - no browser-supplied OAuth origin
- `src/lib/youtube-upload.functions.ts`
  - records intended upload final state before external side effects
  - recovers scheduled uploads as `scheduled`, not `uploaded`
  - supports YouTube category names/IDs
  - supports playlist ID or playlist title lookup
  - playlist failure is logged as a warning without falsely failing a successful upload
  - streams rendered video into YouTube resumable upload instead of first creating a full in-memory Blob
  - reconciles completed campaigns after upload/publication checks

## Storage/data lifecycle

- `src/lib/data-management.functions.ts`
  - campaign deletion cleans render objects from Storage
  - delete-all cleans campaign renders and owned asset objects
- `src/routes/_app/campaigns/$campaignId.tsx`
  - campaign delete goes through storage-aware server command
  - manual Publish only appears for rows with a rendered MP4 and no existing YouTube video
  - Campaign Details only loads the first 25 queue rows; counters come from campaign aggregates / count query
- `src/routes/_app/campaigns/index.tsx`
  - storage-aware delete
  - real 50-row pagination
- `src/routes/_app/settings.tsx`
  - delete-all uses server cleanup
  - sample JSON/CSV download links no longer point to nonexistent public files

## Scalability/release engineering

- `src/routes/_app/dashboard.tsx`
  - dashboard statistics use DB count queries instead of downloading every campaign item status
- `.github/workflows/release-certification.yml`
  - clean npm install and `verify:release`
  - optional Supabase integration job when test secrets are configured
- `.nvmrc`
  - Node 20.19.1
- `package.json`
  - canonical npm package manager metadata and engine range
- removed `bun.lock`; npm is now the single package-manager lock path
- `scripts/check-migrations.mjs`
  - verifies V2.16 migration invariants

## New regression coverage

- `src/lib/schedule-generation.test.ts`
- `src/lib/render-materialization.test.ts`
- `src/integration/v2-16-workflow-consistency.integration.test.ts`
- updated V2.13/V2.15 integration fixtures for the new activation preflight
