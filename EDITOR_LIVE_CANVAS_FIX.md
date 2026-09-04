# Editor Live Canvas Repair

## Fixed

The editor canvas now evaluates the same materialized automation document used by the full Preview modal.

Previously:
- Preview called `materializeAutomationDocument(doc, vars)` before frame evaluation.
- Canvas evaluated the raw document directly.
- Dynamic/repeated/conditional templates could render correctly in Preview but appear blank in the main editor canvas.

Now:
- Canvas materializes automation variables first.
- The selected source scene maps to its live/materialized scene.
- The canvas evaluates that scene at the current local playhead.
- Dynamic Half-Cut Word/Letter generated elements appear directly in the canvas.
- Inline editor audio also uses the materialized document.

## Canvas sizing bug fixed

The old fit-to-screen calculation could run before the editor container had a usable size and could produce an invalid/negative canvas scale. It recalculated only on a browser window resize.

Now:
- `ResizeObserver` watches the actual canvas container.
- fit scale is clamped to `0.05..4`.
- canvas recenters after panel/layout size changes.
- opening/closing sidebars and responsive layout changes no longer leave the artboard invisible.

## Validation behavior

Automation validation errors no longer result in an unexplained blank canvas. The editor uses template defaults where possible and displays a small warning overlay.

## Verification

Passed:
- `npm run integrity`
- `npm run integrity:migrations`

The project archive does not contain `node_modules`, so dependency-aware `npm run typecheck` could not be executed in this environment.
