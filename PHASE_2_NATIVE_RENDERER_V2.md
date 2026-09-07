# Phase 2 — Native Renderer V2 / Real Multi-Layer Composition

## Scope
Phase 2 preserves the Phase 1 canonical composition boundary and upgrades the self-hosted native worker rather than bypassing capability certification.

## Implemented
- Native FFmpeg V2 filter-graph planner separated into `worker/src/render-v2.mjs`.
- Multiple overlapping native video clips are accepted and composited bottom-to-top according to manifest track order.
- Native manifest image tracks are accepted by the worker and looped as still-image FFmpeg inputs.
- Source trim, playback rate, timeline start/end, fit/crop/contain, x/y position, scale-derived dimensions, rotation, opacity and common media filters are translated to FFmpeg.
- Brightness/contrast/saturation and blur adjustments are translated to FFmpeg equivalents.
- Timeline audio clips are now worker inputs, mixed to AAC with source trim, playback-rate conversion and absolute project timing.
- Shared timeline audio gain is sampled at 20ms and emitted as a gain envelope, preserving fades, mute/solo state and voiceover ducking in the native mix.
- HTML/text/image/caption/effect scene state is materialized at output FPS rather than the old ~500ms cadence, removing timeline sampling drift for that path.
- Video keyframe descriptors can now be requested at output-frame cadence through `collectTimelineVideoSegments(..., sampleStepMs)`.
- Campaign background video can coexist with document video layers; the old worker-V1 combination guard is removed.
- Capability contract is upgraded to `native-ffmpeg-v2`, version 2. Audio and multi-video V1 blockers are removed only because the worker now consumes them.

## Intentionally still blocked
- Triangle/star/line native shape geometry.
- Shape stroke/fillOpacity semantics not represented by the current HTML serializer.

## Remaining parity warnings
- HTML/text/editor-image rendering still uses SVG `foreignObject` + librsvg, so font/CSS/image decoding is not yet pixel-certified against browser preview.
- CSS effects and some browser media filter math may differ slightly from FFmpeg equivalents.
- Editor image elements remain in the frame-rasterized scene path to preserve camera/effect semantics. The worker nevertheless supports explicit native image manifest tracks for future migration.

## Verification
- `npm run integrity`: PASS — 231 TS/TSX files, zero unresolved internal imports.
- `npm --prefix worker test`: PASS — 3/3 tests.
- `node --check worker/src/index.mjs`: PASS.
- `node --check worker/src/render-v2.mjs`: PASS.
- Real FFmpeg smoke render: PASS — two overlapping videos + rotation + opacity + gain-envelope audio generated a 1s H.264/AAC MP4 successfully.
- Full repository TypeScript/build/Vitest/lint: NOT CERTIFIED in this environment because project dependencies are not installed (`vite/client` type definitions missing).
