# V2.14 Certification Result

## Executed in this environment
- Source integrity: PASS — 157 TS/TSX files, 0 unresolved internal imports.
- Migration integrity: PASS — 17 ordered SQL migrations; V2.13 queue/security invariants detected.
- TypeScript parser/transpile diagnostics: PASS — 157 TS/TSX files, 0 syntax failures.
- `npm ci`: BLOCKED — npm registry/install timed out; `node_modules` could not be restored.
- Full `npm run verify:release`: BLOCKED at `tsc` because `vite/client` is unavailable without dependencies.
- Fresh Supabase migration run: BLOCKED — this environment has no Supabase CLI/Docker/psql and no disposable DB URL was supplied.
- Playwright browser E2E: BLOCKED — no staging URL/credentials and Playwright browser runtime supplied.
- Browser memory profile: BLOCKED — no staging editor URL/credentials supplied.
- Real render/storage/YouTube staging chain: BLOCKED — no staging Supabase/YouTube credentials or campaign supplied.

## Required external certification
1. On a clean CI runner: `npm ci && npm run verify:release`.
2. Against a disposable fresh Supabase/Postgres DB: set test DB/API credentials and run `npm run verify:fresh-supabase`.
3. Install Playwright in the certification runner (`npm install --no-save playwright && npx playwright install chromium`) and run `npm run test:e2e`.
4. Set `E2E_EDITOR_PATH` and run `npm run profile:browser` on a realistic long project.
5. Run one staging campaign with V2.11 dynamic array data, canonical server render, Supabase Storage output, and a private/scheduled YouTube upload; then run `npm run certify:staging` and retain its JSON output as release evidence.

A blocked gate is intentionally not reported as passed.
