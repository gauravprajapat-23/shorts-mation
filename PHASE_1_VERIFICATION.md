# Phase 1 verification

## Passed in this environment

- `npm run integrity` — passed: 231 TS/TSX files, zero unresolved internal imports.
- `npm --prefix worker test` — passed: worker signed-request security test.
- Phase 1 source assertions — passed for canonical materialization, capability preflight wiring, canonical manifest input, caption-in-scene composition, audio/video capability guards, and unchanged worker hard limits used by the certification matrix.

## Added automated tests

- `src/lib/render-capabilities.test.ts`
  - basic canonical composition is accepted;
  - timeline audio is blocked before worker submission;
  - multiple video segments are blocked before worker submission;
  - captions/keyframe-related fidelity is surfaced as approximate rather than silently treated as exact.
- `src/lib/render-materialization.test.ts`
  - structured automation values remain structured;
  - unattended materialization produces the Phase 0 canonical composition envelope.

## Environment limitation

A full `npm ci --ignore-scripts --no-audit --no-fund` was attempted but exceeded the execution window before dependencies finished installing. Because `node_modules` was unavailable, full project `typecheck`, Vitest, build, and lint could not be executed here. They are not marked as passed.

Run the following in the normal development/CI environment before release:

```bash
npm ci
npm run verify
npm run test:worker
```

## Phase boundary

No renderer wholesale replacement was performed. `worker/src/index.mjs` rendering behavior remains unchanged; Phase 1 protects it with canonical input and preflight certification while fixing the caption-manifest composition mismatch on the application side.
