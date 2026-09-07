# ShortsForge Native FFmpeg Worker

Deploy this directory separately from Lovable Cloud. The app submits signed jobs; this service owns native FFmpeg execution and temporary output files.

Required: `FFMPEG_WORKER_SECRET` (same secret saved in Settings), `PUBLIC_WORKER_URL` (public HTTPS origin). Optional: `PORT=8080`, `MAX_CONCURRENCY=2`, `MAX_RETRIES=2`, `FFMPEG_PRESET=medium`, `FFMPEG_CRF=21`.

Build/run: `docker build -t shortsforge-ffmpeg-worker worker` then run the container with the environment above. The worker exposes signed `/health`, `/jobs`, `/jobs/:id`; completed output uses a one-time per-job URL token. Graceful SIGTERM/SIGINT stops new work and waits for active jobs.

## Native Renderer V2

The worker now consumes the Phase 2 manifest with real multi-layer FFmpeg composition. It supports overlapping video inputs, explicit image inputs, source trims, timeline positioning, transforms, opacity, common filters, timeline audio mixing, and sampled fade/ducking gain envelopes. The HTML frame stream remains the base for text/captions/effects/editor-image parity while the project migrates progressively toward a fully native/Chromium render path.

## Renderer V3: Chromium + FFmpeg
Visual HTML/CSS frames are rasterized with persistent headless Chromium through CDP. Chromium waits for fonts and images before each screenshot. FFmpeg remains responsible for video/image overlays, audio mixing and final H.264/AAC encoding.

Optional environment variables:
- `CHROMIUM_PATH` (default `chromium` locally; Docker sets `/usr/bin/chromium`)
- `CHROMIUM_ASSET_TIMEOUT_MS` (default `15000`)
- `RENDER_FONT_STYLESHEET_URL` (defaults to the same Inter + Plus Jakarta Sans Google Fonts stylesheet used by the web app)
- `PIXEL_PARITY_MIN_SSIM` (default `0.995` for certification CLI)

Pixel parity:
```bash
npm run certify:parity -- /path/browser-preview.png /path/server-frame.png 0.995
```
