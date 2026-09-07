# Phase 7 changed files

- `src/lib/youtube-oauth.functions.ts` — live-request-origin fallback for OAuth start.
- `src/lib/youtube-upload.functions.ts` — deterministic upload attempt, persisted/resumable chunk upload, duplicate reconciliation marker, durable retry mode.
- `src/lib/campaign-scheduler.server.ts` — durable scheduling/dispatch pass.
- `src/lib/youtube-publisher-v2.server.ts` — leased publish queue, heartbeats, retries, quota handling, scheduled-public reconciliation.
- `src/routes/api/public/hooks/process-campaign-queue.ts` — dispatch -> render -> R2 completion -> redispatch -> publish pipeline.
- `supabase/migrations/20260907130000_phase7_exactly_once_publishing.sql` — publish queue, scheduler runs and atomic claim/recovery functions.
- `.env.example` — Phase 7 publisher configuration and optional `PUBLIC_APP_URL` clarification.
- `PHASE_7_RENDER_SCHEDULER_EXACTLY_ONCE_PUBLISHING.md` — architecture and recovery contract.
