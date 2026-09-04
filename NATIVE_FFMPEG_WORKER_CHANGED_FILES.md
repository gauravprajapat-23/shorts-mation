# Native FFmpeg Worker Migration

Active campaign automation now uses the separately deployed `worker/` service. Shotstack remains only in historical compatibility tests/source and is not imported by campaign automation or Settings.

Key files: `worker/`, `src/lib/ffmpeg-worker.server.ts`, `src/lib/ffmpeg-worker-manifest.server.ts`, `src/lib/render-manifest.server.ts`, `src/routes/api/public/render-manifest.ts`, `src/lib/render-pipeline.server.ts`, `src/lib/render-settings.*`, `src/routes/_app/settings.tsx`, migration `20260904182000_native_ffmpeg_worker.sql`.

The worker accepts HMAC-signed idempotent jobs, bounds concurrency, retries, reports queued/rendering/progress/completed/failed/cancelled, runs native `ffmpeg` in Docker, and exposes tokenized temporary MP4 output. Lovable Cloud owns durable attempt/item state and copies successful output into the existing `renders` bucket.
