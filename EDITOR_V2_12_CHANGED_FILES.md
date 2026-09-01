# Editor V2.12 — Shorts Retention Intelligence & Visual Presets

## Added
- `src/lib/retention.ts` — deterministic scene-role inference, project retention analysis, visual rhythm presets, CTA timing, pattern-interrupt/B-roll suggestions, and editable retention preset materialization.
- `src/lib/retention.test.ts` — regression coverage for inferred roles, preset application, pattern-interrupt suggestions and missing CTA detection.

## Updated
- `src/lib/types.ts` — scene roles, per-scene retention flags, project visual-rhythm settings and preset IDs.
- `src/lib/editor-document-v2.ts` — normalizes V2.12 retention settings for existing V2 and migrated V1 templates.
- `src/routes/_app/editor/$templateId.tsx` — Retention workspace, preset controls, rhythm settings, scene-role controls, exact-time suggestions, and per-scene overrides.

## Behavior
- Presets: Balanced, Fast Viral, Educational, Story and Minimal.
- Scene roles: Hook, Context, Value, Pattern Interrupt, Payoff and CTA.
- Automatic, editable micro-zoom keyframes on suitable image/video layers.
- Caption emphasis on hook/payoff/CTA beats.
- Deterministic transition/effect rhythm.
- Pattern-interrupt and missing-B-roll suggestions with timeline timestamps.
- CTA detection and configurable minimum CTA screen time.
- All generated changes are normal editor data (keyframes, transitions, effects, caption styles), so existing Preview/FFmpeg/Shotstack pipelines render them without a separate AI-only renderer.
