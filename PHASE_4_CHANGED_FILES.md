# Phase 4 changed files

- `.github/workflows/renderer-parity.yml` — hard CI parity gate.
- `package.json` — repository renderer certification command wired into release verification.
- `worker/package.json` — pinned Fontsource catalog plus golden/release commands.
- `worker/Dockerfile` — installs worker dependencies and copies golden suite.
- `worker/src/index.mjs` — prefetches/re-writes all assets before Chromium and uses local font catalog.
- `worker/src/chromium-renderer.mjs` — requires explicit deterministic font stylesheet.
- `worker/src/font-catalog.mjs` — versioned self-hosted font catalog.
- `worker/src/asset-cache.mjs` — SHA-256 asset prefetch/index/local serving/rewrite.
- `worker/src/golden-fixtures.mjs` — representative render fixtures/timestamps.
- `worker/src/asset-cache.test.mjs` — cache discovery/rewrite tests.
- `worker/src/chromium-renderer.test.mjs` — deterministic stylesheet-aware document test.
- `worker/scripts/golden-render-suite.mjs` — multi-frame SSIM certification and baseline update flow.
- `worker/goldens/references/*.png` — 25 golden reference frames.
- `worker/goldens/last-report.json` — latest certification report.
- `PHASE_4_DETERMINISTIC_ASSETS_FONTS_GOLDENS.md` — architecture and deployment contract.
