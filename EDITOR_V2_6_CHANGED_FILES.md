# Editor V2.6 — Changed Files

## New
- `src/lib/captions.ts` — caption presets, word timing, clip creation and trim helpers.
- `src/lib/captions.test.ts` — word timing and shared timeline evaluation coverage.

## Updated
- `src/lib/types.ts` — caption clip/word/style types and `captions` track kind.
- `src/lib/editor-defaults.ts` — blank V2 documents include caption clips.
- `src/lib/editor-document-v2.ts` — caption migration/normalization and dedicated track synchronization.
- `src/lib/timeline-engine.ts` — canonical caption frame/active-word evaluator.
- `src/lib/scene-svg.ts` — professional caption SVG rendering for Preview and FFmpeg.
- `src/lib/shotstack.server.ts` — word-boundary caption HTML segments for server renders.
- `src/components/editor/timeline/EditorTimeline.tsx` — caption track selection, dragging and trimming.
- `src/routes/_app/editor/$templateId.tsx` — captions panel, presets, canvas rendering and word timing properties.
- `src/lib/audio-timeline.test.ts`, `src/lib/timeline-engine.test.ts`, `src/lib/shotstack.server.test.ts` — updated V2 fixtures and caption render coverage.
