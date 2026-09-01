# Half-Cut Word Match — Any Word

## Added capability
- Added a generic `halfLetterWord` dynamic scene layout that expands one `word` automation input into a complete half-cut letter matching animation.
- Supports 2–10 alphanumeric characters and repeated letters (for example `APPLE`).
- Each character gets a bright palette color; the stationary left half and moving/completed right half use the same character color.
- Moving right halves are processed in reverse order and descend through the remaining unmatched slots. Wrong attempts show a red `✕` and play the wrong-match beep. Correct attempts show a green `✓`, play the success beep, and the right half remains attached to complete the letter.
- Scene duration and SFX timing are generated deterministically from word length and attempt count.

## Background
- Default background uses editable shape layers only: cyan sky, horizon strip, and green grass.
- Optional `backgroundImage` automation variable replaces the default coded background when supplied.
- The ending scene uses the same default/custom background behavior.

## Starter
- Added `Half-Cut Word Match — Any Word` (`half_cut_word_match`).
- Inputs: `word`, `backgroundImage`, and `cta`.
- Default word: `HOUSE`.
- Sample CSV includes APPLE, MANGO, LION, ZEBRA, COCK, and HOUSE.

## Files changed
- `src/lib/types.ts`
- `src/lib/automation-variables.ts`
- `src/lib/starter-templates.ts`
- `src/lib/sample-csv.ts`
- `src/lib/half-cut-word-match.test.ts`

## Verification
- `npm run integrity`: PASS — 163 TS/TSX files, 0 unresolved internal imports.
- TypeScript parser/transpile audit: PASS — 163 files, 0 syntax failures.
- Migration integrity: PASS — 18 migrations with V2.13/V2.15 invariants present.
- Dependency-aware Vitest/typecheck/build were not run because this packaged source has no installed `node_modules` in the current environment.
