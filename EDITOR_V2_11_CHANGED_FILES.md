# Editor V2.11 — Automation Variables + Conditional/Dynamic Scenes

## Implemented

- Typed automation-variable definitions: text, image, video, audio, color, number, boolean and array.
- Required/default values plus min/max length/value, regex and color validation in the shared automation engine.
- Backward compatibility: legacy `variables: string[]` is automatically interpreted as typed text variables.
- `visibleWhen` conditions on visual elements and scenes (`exists`, `notEmpty`, `equals`, `notEquals`, `contains`, `truthy`, `falsy`).
- Array-driven scene repetition with configurable item/index aliases and max item caps.
- Object-array bindings such as `{{item.title}}` plus 1-based `{{index}}`.
- Shared `materializeAutomationDocument()` step used by `resolveDocVars`, so editor preview, timeline evaluation, FFmpeg and Shotstack consume the same concrete generated scenes.
- Audio sources and caption word text can resolve typed automation variables.
- Campaign/server render ingestion preserves arrays/objects as JSON strings instead of lossy comma-separated `String(value)` conversion.
- Editor Variables panel for defining types/defaults/validation and configuring the current scene repeater.
- Properties-panel conditional visibility controls for selected visual elements.
- Preview modal uses typed inputs, defaults, validation errors and expanded dynamic duration.
- Regression tests for validation, object-array repetition, conditional visibility and server-style JSON array strings.

## Main files

- `src/lib/types.ts`
- `src/lib/automation-variables.ts` (new)
- `src/lib/automation-variables.test.ts` (new)
- `src/lib/animate.ts`
- `src/lib/editor-document-v2.ts`
- `src/lib/editor-defaults.ts`
- `src/lib/render-pipeline.server.ts`
- `src/lib/auto-render.ts`
- `src/lib/render-jobs.functions.ts`
- `src/routes/_app/editor/$templateId.tsx`

## Validation

TypeScript parser/transpilation diagnostics passed for all V2.11 changed TS/TSX files. `npm run typecheck` still cannot complete in this archive because the local dependency set is missing the `vite/client` type definitions. Targeted Vitest execution also could not start within the available environment because dependency resolution timed out.
