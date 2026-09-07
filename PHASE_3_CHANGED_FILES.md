# Phase 3 changed files

- `worker/src/chromium-renderer.mjs` — persistent CDP Chromium frame renderer; deterministic viewport/font/image waits.
- `worker/src/chromium-renderer.test.mjs` — renderer document and parity-budget tests.
- `worker/src/pixel-parity.mjs` — FFmpeg SSIM PNG comparison utility.
- `worker/scripts/pixel-parity-certify.mjs` — release/staging parity CLI.
- `worker/src/index.mjs` — replaces SVG/librsvg raster loop with Chromium capture loop.
- `worker/Dockerfile` — installs Chromium/font packages and removes librsvg runtime dependency.
- `worker/package.json` — adds `certify:parity` script.
- `src/lib/render-capabilities.ts` — capability version 3 and Chromium-backed fidelity inventory.
- `src/lib/render-capabilities.test.ts` — V3 certification expectations.
- `PHASE_3_CHROMIUM_PIXEL_PARITY.md` — architecture, certification and remaining-gap documentation.
- `PHASE_3_CHANGED_FILES.md` — this manifest.
