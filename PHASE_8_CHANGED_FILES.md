# Phase 8 Changed Files

- `src/lib/r2-publish-source.server.ts` — server-side R2 SigV4 presigning, object probe, ranged chunk reads.
- `src/lib/ffmpeg-worker.server.ts` — worker status exposes authoritative R2 object key.
- `worker/src/index.mjs` — job status returns `outputObjectKey`.
- `src/lib/render-pipeline.server.ts` — R2-native completion path; legacy provider copy retained only as fallback.
- `src/lib/youtube-upload.functions.ts` — direct ranged R2 → YouTube resumable uploader and publish checkpoints.
- `src/lib/youtube-publisher-v2.server.ts` — stable publisher nodes, fleet heartbeats/draining, durable checkpoint telemetry.
- `src/lib/campaign-scheduler.server.ts` — advisory-lock scheduler leadership.
- `src/routes/api/public/hooks/process-campaign-queue.ts` — authenticated publisher-fleet health on GET.
- `supabase/migrations/20260907140000_phase8_r2_direct_publisher_fleet.sql` — R2 output identity, publisher fleet, scheduler leadership, Phase 8 dispatch.
- `scripts/phase8-certify.mjs` — static architecture/crash-boundary certification.
- `scripts/phase8-live-certify.mjs` — real staging/test-channel end-to-end certification harness.
- `.env.example`, `package.json` — Phase 8 operational and certification settings/scripts.
