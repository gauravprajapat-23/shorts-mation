# Phase V2.15 — Queue Control Center & State Integrity Repair

## Database / security
- `supabase/migrations/20260901181500_v2_15_queue_control_state_integrity.sql`
  - revokes authenticated direct UPDATE/DELETE on `campaign_items`
  - constrains authenticated inserts to clean `pending` queue rows
  - adds authenticated stage-aware `retry_campaign_item()` RPC
  - adds transactional `bulk_update_queue_items()` RPC
  - preserves V2.13 immutable render/upload attempt ownership

## Queue server commands
- `src/lib/queue-control.functions.ts`
  - retry render/upload via RPC
  - atomic pre-provider bulk schedule/privacy updates
  - server-side YouTube rescheduling for already-scheduled videos
  - server-side YouTube privacy synchronization for uploaded videos
  - render/upload attempt-history retrieval

## YouTube reconciliation
- `src/lib/youtube-upload.functions.ts`
  - exports shared token refresh helper for server queue commands
  - no longer marks scheduled items published merely because publishAt passed
  - queries YouTube and only advances scheduled -> uploaded after remote `public` confirmation

## Queue UI
- `src/routes/_app/campaigns/$campaignId.queue.tsx`
  - Queue Control Center layout
  - loading/error/retry states
  - controlled schedule drafts
  - transactional auto-schedule/CSV preview
  - remote-bound schedule protection
  - synchronized YouTube schedule action
  - stage-aware Retry Render / Retry Upload
  - retry count display
  - attempt-history drawer
  - desktop overflow handling and mobile cards
  - explicit browser/campaign timezone display
  - privacy controls with remote synchronization
- `src/routes/_app/campaigns/$campaignId.automation.tsx`
  - Queue & Schedule / Activity navigation
- `src/components/status-badge.tsx`
  - failed state is now destructive/red consistently

## Schedule helpers / tests
- `src/lib/schedule-bulk.ts`
  - timezone column in exported CSV
  - invalid privacy values are rejected rather than silently ignored
- `src/lib/schedule-bulk.test.ts`
  - timezone, unknown-id, invalid-privacy, deterministic spread tests
- `src/integration/v2-15-queue-control.integration.test.ts`
  - direct update blocked
  - forged uploaded insert blocked
  - direct delete blocked
  - stage-aware retry
  - transactional bulk schedule update
- `package.json`
  - integration command now executes all integration suites
- `scripts/check-migrations.mjs`
  - asserts V2.15 queue-control invariants
