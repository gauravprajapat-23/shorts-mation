# ShortsForge Native FFmpeg Worker

Deploy this directory separately from Lovable Cloud. The app submits signed jobs; this service owns native FFmpeg execution and temporary output files.

Required: `FFMPEG_WORKER_SECRET` (same secret saved in Settings), `PUBLIC_WORKER_URL` (public HTTPS origin). Optional: `PORT=8080`, `MAX_CONCURRENCY=2`, `MAX_RETRIES=2`, `FFMPEG_PRESET=medium`, `FFMPEG_CRF=21`.

Build/run: `docker build -t shortsforge-ffmpeg-worker worker` then run the container with the environment above. Set `PUBLIC_WORKER_URL` to that deployment's public HTTPS origin, then save the same URL and secret in the app's Settings page. The worker exposes signed `/health`, `/jobs`, `/jobs/:id`; completed output uses a per-job capability URL. Graceful SIGTERM/SIGINT stops new work and waits for active jobs.

The container includes native FFmpeg and librsvg. Campaign automation sends signed, short-lived SVG timeline manifests; the worker rasterizes frames, encodes H.264/yuv420p MP4 output, reports queued/rendering/completed/failed progress, and retains output only for `JOB_TTL_SECONDS` (six hours by default).
