# Phase V2.15 Verification

## Passed in this environment
- TypeScript parser/transpile diagnostics: **160 TS/TSX files, 0 syntax failures**
- `npm run integrity`: **160 files, 0 unresolved internal imports**
- `npm run integrity:migrations`: **18 migrations, unique ordering, V2.13 + V2.15 queue invariants present**

## Full dependency-aware verification
`npm run typecheck` cannot execute application type checking in this environment because dependencies are not installed and TypeScript cannot resolve `vite/client` (`TS2688`). This is the same external dependency-installation limitation recorded in V2.14.

Run on a machine/CI runner with registry access:

```bash
npm ci
npm run verify:release
npm run test:integration
```

The integration suite requires a disposable Supabase project with the full migration chain applied and:
- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`
- `SUPABASE_TEST_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

## Important behavior after V2.15
- Browsers cannot directly mutate or delete queue rows.
- Queue inserts cannot be forged into processing/uploaded states.
- Failed retries are stage-aware and increment `retry_count`.
- Bulk pre-YouTube scheduling is validated before a single transaction commits.
- Scheduled YouTube rows cannot be silently changed only in the local DB.
- Scheduled publication is not considered complete until YouTube confirms `privacyStatus=public`.
