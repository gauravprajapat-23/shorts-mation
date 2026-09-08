# Phase 8 — Direct R2 → YouTube Streaming, Publisher Fleet & Automation Certification

## Production path

`CSV/materialized campaign item → canonical render → R2 MP4 → durable publish_jobs lease → ranged R2 reads → YouTube resumable chunks → scheduled/public reconciliation`.

Phase 8 removes the production R2 → Supabase Storage → YouTube video copy. The render worker exposes its authoritative `outputObjectKey`; campaign finalization stores `campaign_items.render_output_object_key`; the publisher probes the object and reads one YouTube chunk at a time using HTTP Range requests against short-lived R2 SigV4 URLs.

## Scheduler leadership

`phase8_dispatch_campaign_scheduler()` uses `pg_try_advisory_xact_lock(hashtext('shorts-mation:campaign-scheduler:v8'))`. Only the transaction holding the lock materializes a scheduler tick. Losing contenders return `leader_acquired=false`; render/publish jobs remain idempotent.

## Publisher fleet

Every publisher process has a stable `PUBLISH_WORKER_ID` (or hostname/PID fallback), heartbeats into `publisher_nodes`, and claims publish jobs through the Phase 7 `FOR UPDATE SKIP LOCKED` lease function. `PUBLISH_DRAINING=1` registers the node as draining and prevents new claims. Authenticated GET on `/api/public/hooks/process-campaign-queue` returns fleet/queue health.

## Exactly-once checkpoints / crash drills

The durable checkpoints are:

1. `source_verified`
2. `youtube_session_created`
3. `upload_progress`
4. `youtube_committed`
5. `campaign_committed`

`PUBLISH_CRASH_AFTER_CHECKPOINT=<name>` is test-only fault injection. The checkpoint is persisted in `publish_jobs.external_commit_checkpoint` before the injected failure. Retry then reuses the same `upload_attempts` idempotency key and YouTube resumable session, or reconciles the already-created YouTube video ID/marker.

## Live certification

Static/source certification: `npm run certify:phase8`.

Real staging/test-channel certification: configure a campaign item created from the normal CSV/template workflow, point it at a test channel, then set `PHASE8_CERT_APP_URL`, `PHASE8_CERT_ITEM_ID`, `CRON_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; optionally set `PHASE8_CERT_EXPECT_PUBLIC=1`. Run `npm run certify:phase8:live`. The harness repeatedly drives the production cron, waits for an R2 object key and YouTube video ID, and when public certification is requested waits until the video is publicly observable.

The live test was not executed in this workspace because no production/staging Supabase, R2 and YouTube test-channel credentials were supplied.
