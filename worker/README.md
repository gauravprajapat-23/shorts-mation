# ShortsForge Native FFmpeg Worker

Deploy this directory separately from Lovable Cloud. The app submits signed jobs; this service owns native FFmpeg execution and temporary output files.

Required: `FFMPEG_WORKER_SECRET` (same secret saved in Settings), `PUBLIC_WORKER_URL` (public HTTPS origin). Optional: `PORT=8080`, `MAX_CONCURRENCY=2`, `MAX_RETRIES=2`, `FFMPEG_PRESET=medium`, `FFMPEG_CRF=21`.

Build/run: `docker build -t shortsforge-ffmpeg-worker worker` then run the container with the environment above. The worker exposes signed `/health`, `/jobs`, `/jobs/:id`; completed output uses a one-time per-job URL token. Graceful SIGTERM/SIGINT stops new work and waits for active jobs.
