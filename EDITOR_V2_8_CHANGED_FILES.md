# Editor V2.8 — Advanced Animation + Keyframes

## Added
- `src/lib/keyframes.ts`
  - clip-local property keyframe evaluation
  - easing curves: linear, easeIn, easeOut, easeInOut, spring, bounce
  - reusable Shorts motion presets
- `src/lib/keyframes.test.ts`
  - interpolation and preset regression tests

## Updated
- `src/lib/types.ts`
  - `ElementKeyframe`, `KeyframeProperty`, extended `EaseName`
  - optional `keyframes` on every visual editor element
- `src/lib/animate.ts`
  - keyframe evaluation is composed with existing entrance/exit/loop animation state
  - frame state now includes cropX/cropY/cropScale
- `src/lib/timeline-engine.ts`
  - keyframed video clips are sampled into short renderer descriptors so backends consume the same motion curve
- `src/components/editor/timeline/EditorTimeline.tsx`
  - keyframe diamonds shown directly on visual clips
  - click to seek, drag to retime
- `src/routes/_app/editor/$templateId.tsx`
  - keyframe property controls
  - per-keyframe timing, easing and values
  - motion preset picker
  - image/video crop preview transforms
- `src/lib/scene-svg.ts`
  - crop keyframes applied to image rendering for SVG/FFmpeg
- `src/lib/ffmpeg-render.ts`
  - sampled keyframed video scale/position/opacity/blur/rotation/crop filters
- `src/lib/shotstack.server.ts`
  - keyframed graphics/text use shared sampled HTML frames
  - keyframed video segments follow sampled position/scale/opacity descriptors

## Keyframe properties
- X / Y
- Scale
- Rotation
- Opacity
- Blur
- Crop X / Crop Y / Crop Scale

Keyframe timestamps are relative to the clip, not the scene. Moving a clip therefore preserves its internal motion timing.
