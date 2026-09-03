# Professional Template Import Test Report

## Fixture

`public/templates/half-cut-word-match-pro.shorts-template.json`

## What is tested

- Official `shorts-mation-template` envelope, format version 1.
- Canonical Editor V2 document, 9:16, two scenes.
- `halfLetterWord` dynamic layout driven by one `word` variable.
- Word validation for 2–10 alphanumeric characters.
- Coded sky/grass background plus optional custom background image.
- Correct/wrong built-in SFX references.
- Production importer regression test in `src/lib/professional-template-import.test.ts`.
- Materialization regression with `MANGO`: five fixed halves, five moving halves, wrong feedback and correct feedback.

## Verification performed in this environment

- Portable fixture contract: PASS.
- Source integrity: PASS, 166 TS/TSX files, 0 unresolved internal imports.
- Migration integrity: PASS, 18 migrations.
- TypeScript parser/transpile audit: PASS, 166 TS/TSX files, 0 syntax failures.
- Actual Vitest importer/materialization test: BLOCKED because this runtime has no installed `node_modules` and `vitest` is not available.

When dependencies are installed, run:

```bash
npm ci
npm test -- src/lib/professional-template-import.test.ts
```
