# Half Letter Match — Sliding Halves

## Added
- `Half Letter Match — Sliding Halves` starter template.
- True 50/50 text-layer clipping (`clipInsetPct`) so two halves are cut from the exact same glyph.
- Reverse-order ANT demo: T-right tests A/N/T, N-right tests A/N, A-right completes A.
- Wrong/correct visual feedback aligned to collisions.
- Built-in wrong and correct WAV SFX under `public/sounds/`.
- 3-letter automation variables: `word`, `letter1`, `letter2`, `letter3`, `cta`.
- Sample CSV rows for ANT, CAT, DOG, RAT, HEN, AXE.
- Regression tests for clipping, reverse motion, SFX, token materialization, and sample CSV.

## Rendering parity
- Canvas supports `clipInsetPct`.
- SVG/FFmpeg path emits an SVG clipPath for clipped text.
- Shotstack HTML rendering uses matching CSS `clip-path: inset(...)`.
- Relative public SFX URLs are expanded with `PUBLIC_APP_URL` for Shotstack server renders.

## Verification
- `npm run integrity`: PASS — 162 TS/TSX files, 0 unresolved internal imports.
- `npm run integrity:migrations`: PASS — 18 SQL migrations.
- TypeScript parser/transpile audit: PASS — 162 files, 0 syntax failures.
- Full dependency-aware test/build chain was not re-certified because dependencies are unavailable in this runtime.
