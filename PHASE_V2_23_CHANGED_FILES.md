# V2.23 — Professional Editor UX

## New
- `src/lib/editor-professional.ts`
  - selection bounds
  - group-aware selection
  - multi-element move
  - align/distribute operations
  - group/ungroup
  - copy/paste serialization
  - multi-duplicate helpers
- `src/lib/editor-professional.test.ts`

## Updated
- `src/lib/types.ts`
  - editor elements can persist `hidden` and `groupId`
- `src/lib/timeline-engine.ts`
  - hidden layers are excluded from canonical visible/render state
- `src/routes/_app/editor/$templateId.tsx`
  - multi-select state
  - group-aware selection
  - duplicate/copy/paste
  - group/ungroup
  - align/distribute toolbar
  - multi-layer keyboard nudging
  - Ctrl/Cmd+A, C, V, D, G, Shift+G, Escape shortcuts
  - history panel with snapshot restore
  - safe-zone/ruler controls
  - mobile tools drawer
  - responsive left/right panels
- `src/components/editor/EditorSurface.tsx`
  - multi-selection outlines
  - group movement
  - existing snap guides extended to grouped selections
  - rulers
  - title/action safe zones
  - zoom-to-selection
  - searchable layers
  - per-layer lock/hide controls
- `src/components/editor/timeline/EditorTimeline.tsx`
  - clip edge/playhead/scene snapping
  - frame-snapped keyframe movement
  - responsive timeline height
