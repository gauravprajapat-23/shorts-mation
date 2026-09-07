# Phase 3 — Chromium Composition Renderer & Pixel-Parity Certification

## Production boundary
Phase 3 preserves the canonical composition and FFmpeg V2 media/audio compositor introduced in Phases 1–2. Only the HTML/CSS frame rasterizer is replaced.

`CanonicalComposition -> frame-cadence HTML -> headless Chromium PNG -> FFmpeg media/audio composition -> H.264/AAC MP4`

## What changed
- Removed active `SVG foreignObject -> rsvg-convert` frame rasterization.
- Added persistent headless Chromium renderer over Chrome DevTools Protocol; no Puppeteer/Playwright runtime dependency.
- Fixed viewport/device scale to output dimensions and DPR 1.
- Waits for `document.fonts.ready`, image load/decode, and two animation frames before capture.
- Uses the same Inter + Plus Jakarta Sans Google Fonts stylesheet as the web application by default (`RENDER_FONT_STYLESHEET_URL` can override it).
- Updated Docker worker image with Chromium and deterministic baseline system fonts; librsvg is no longer required.
- Added PNG pair SSIM certification CLI with default minimum 0.995.
- Promoted browser-native HTML visuals/keyframes/captions/camera/effects from approximate to exact renderer-model support.
- Kept FFmpeg color/filter conversion approximate and unsupported vector shape semantics blocked.

## Pixel parity workflow
Capture the editor/browser preview at the exact project time and output dimensions, capture the corresponding server frame, then run:

```bash
npm --prefix worker run certify:parity -- browser-preview.png server-frame.png 0.995
```

The command exits non-zero when SSIM is below the threshold. `1.0` means pixel-identical inputs.

## Deterministic resource policy
Chromium does not capture immediately after setting frame HTML. Every frame waits for:
1. web-font readiness,
2. all `<img>` resources to load,
3. image `decode()` where supported,
4. two `requestAnimationFrame` turns.

A resource timeout fails the render instead of silently capturing an incomplete frame. Default timeout is 15 seconds (`CHROMIUM_ASSET_TIMEOUT_MS`).

## Remaining known parity gaps
- Video color/filter presets are still translated from browser concepts to FFmpeg filters; small mathematical/color-space differences remain possible.
- Triangle/star/line vector geometry and shape stroke/fillOpacity remain blocked by preflight because the HTML serializer does not yet express them faithfully.
- User-provided/custom font families outside the application font catalog require a deterministic stylesheet or packaged font source; otherwise Chromium can fall back to a system font.
- A production release should store representative editor-preview golden PNGs and run SSIM certification against server frames in CI/staging for every renderer-affecting change.

## Phase 3 smoke certification
- Worker unit tests: 5/5 passed.
- Source integrity: 231 TS/TSX files, zero unresolved internal imports.
- Migration integrity: 40 unique ordered migrations passed.
- Direct Chromium PNG smoke: passed at 320x240.
- Pixel parity tool smoke: SSIM 1.0 for identical reference/candidate frame.
- Chromium -> FFmpeg H.264 integration smoke: passed, 320x240, 0.5 seconds.

Full application typecheck/Vitest/build/lint was not re-certified in this environment because the project dependency tree is not installed locally. Phase 3 worker and source-integrity checks are independently certified above.
