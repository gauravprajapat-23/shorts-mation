# Editor V2.7 — Professional Text & Design System

## Added
- `src/lib/text-design.ts` — deterministic auto-fit/max-lines layout and shared gradient/shadow helpers.
- `src/lib/text-design.test.ts` — auto-fit and line-limit regression coverage.

## Updated
- `src/lib/types.ts` — V2.7 text gradients, glow/layered shadow model, advanced background styling, auto-fit and max-lines fields.
- `src/lib/scene-svg.ts` — shared text layout, gradient fills/backgrounds, rounded/bordered cards, stronger outlines, legacy shadows and glow for preview/FFmpeg rasterization.
- `src/lib/shotstack.server.ts` — server text HTML now consumes the same V2.7 typography/layout/design properties.
- `src/routes/_app/editor/$templateId.tsx` — richer text inspector, new Shorts presets, auto-fit, gradients, background cards, glow, and Windows-aware shortcut labels.
- `package.json` — cross-platform `typecheck` script for npm/Windows development.

## Windows compatibility
- UI shortcut labels now show Ctrl-based commands on Windows instead of Mac-only Command symbols.
- Existing keyboard handler supports Ctrl+Z, Ctrl+Y, Ctrl+S and Ctrl+D, with platform-correct labels.
- Added `npm run typecheck` rather than requiring platform-specific shell commands.
