# Phase 4 — Deterministic Asset & Font Pipeline + Golden Render Suite

## Production invariant
A render is not allowed to start Chromium until all remote render resources have been materialized into the job-local cache. Chromium receives only localhost asset/font URLs. FFmpeg final composition/encoding remains unchanged from Renderer V2/V3.

`remote manifest -> discover URLs -> SHA-256 job cache -> localhost asset server -> Chromium frames -> FFmpeg -> MP4`

## Asset cache
`worker/src/asset-cache.mjs` recursively discovers HTTP(S) URLs throughout the manifest, including URLs embedded in HTML strings. Every resource is downloaded before Chromium starts, bounded by the worker's existing per-asset byte limit. The cache writes `asset-index.json` with original URL, local filename, SHA-256 and byte count. The manifest is cloned and all known URLs are rewritten to a loopback-only server.

This eliminates render-time dependence on expiring signed URLs after prefetch and prevents mid-render network drift.

## Font catalog
Renderer font catalog: `shorts-mation-fonts-v1`.

Pinned worker packages:
- `@fontsource/inter` 5.3.0
- `@fontsource/plus-jakarta-sans` 5.3.0

The worker serves Fontsource CSS/font files from the same localhost resource server as render assets. Production rendering does not use Google Fonts or another network font endpoint. Missing catalog packages are a hard error.

`ALLOW_FONT_CATALOG_FALLBACK=1` exists only for development/certification bootstrap in network-isolated environments and must not be set in production.

## Golden suite
Golden suite version: `shorts-mation-goldens-v1`.

Representative fixtures:
- football quiz card
- letter-match card
- caption motion
- score board
- stacked CSS effects

25 timestamps are captured across the fixtures. Reference frames live in `worker/goldens/references`; candidates are generated during certification. `worker/goldens/last-report.json` stores per-frame SSIM.

Default minimum SSIM: `0.995`.

Commands:

```bash
npm --prefix worker run goldens:update      # intentional baseline update after visual review
npm --prefix worker run certify:goldens     # hard SSIM gate
npm --prefix worker run certify:release     # worker tests + golden gate
npm run certify:renderer                    # repo-level renderer gate
```

Changing a golden reference is an explicit release action, never automatic during certification.

## Deployment gate
`.github/workflows/renderer-parity.yml` runs the worker release certification for renderer-affecting changes. Root `verify:release` now also invokes `certify:renderer`. Any worker test failure, missing font catalog, missing golden, or SSIM below threshold exits non-zero.

## Current bootstrap note
The coding environment used to implement Phase 4 could not resolve npm registry DNS, so the pinned Fontsource packages could not be installed locally. The 25 reference PNGs included in this Phase 4 package were bootstrapped using `ALLOW_FONT_CATALOG_FALLBACK=1` against the available Liberation Sans system font. The harness itself passes 25/25 at SSIM 1.0 in that environment.

Before the first production deployment, build/install the worker with the pinned Fontsource packages, run `goldens:update` once in that exact image, visually review the 25 references, commit the refreshed references, and then run `certify:release` with no fallback environment variable. This is deliberately a hard gate: production must not silently fall back to a different font rasterizer.
