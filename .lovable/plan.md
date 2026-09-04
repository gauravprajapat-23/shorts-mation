## Goal
Switch campaign automation from Shotstack to a separately deployed native FFmpeg worker, keep render status durable in Lovable Cloud, remove Shotstack configuration from Settings, and leave the project typecheck-clean.

## User-visible result
- Campaigns submit due videos to the FFmpeg worker instead of Shotstack.
- The worker encodes real MP4 files in its own Docker container and reports queued, rendering, progress, completed, and failed states.
- Completed files are copied into the existing renders storage and continue through the existing YouTube upload schedule.
- Settings no longer asks for a Shotstack key; it shows the FFmpeg worker connection/status instead.
- Browser rendering remains available only as the existing explicit legacy fallback.

## Implementation
1. Add a standalone `worker/` Node service and Dockerfile with native FFmpeg, signed job submission, bounded concurrency, retries, health checks, graceful shutdown, and progress callbacks.
2. Add a worker-facing server module and protected public callback/manifest contracts. Reuse the existing render attempt ownership, callback token, storage, retry, dead-letter, and campaign-item status model.
3. Replace Shotstack submission/collection/callback logic in the campaign pipeline with FFmpeg worker calls. Remove provider credential verification from the render path and change automation status to report the FFmpeg worker.
4. Replace the render settings UI and server functions with worker URL/secret configuration, without exposing secrets to the browser. Remove Shotstack API key/env labels and references from active settings and automation code.
5. Add the minimal database migration needed for worker provider/state fields and grants/RLS, if the existing render attempt fields cannot represent worker progress.
6. Repair all current `npm run typecheck` errors, including editor props, audio asset typing, serializable server-function return types, fixture inference, keyframe easing, YouTube token helper naming, and metadata shapes.
7. Add focused worker/pipeline tests and run typecheck, tests, and production build. Confirm the preview build log remains clean.

## Technical details
- The edge app never imports `child_process`, FFmpeg, or worker-only packages.
- Worker jobs use one-time signed callback tokens and an idempotency key; callbacks are authenticated and completion is accepted only for the active attempt.
- Worker output is uploaded to the existing `renders` bucket through the server boundary, preserving the current YouTube upload flow.
- Shotstack compatibility source files/tests may remain only where needed for historical tests, but no active campaign automation or settings path will call or request Shotstack.
