# V2.16 Verification

## Passed in this environment

### Source integrity

`npm run integrity`

Result:

- 173 TS/TSX files scanned
- 0 unresolved internal imports

### Migration integrity

`npm run integrity:migrations`

Result:

- 19 SQL migrations
- unique migration ordering
- V2.13 security/claim invariants found
- V2.15 queue-control invariants found
- V2.16 transactional workflow/recovery invariants found

### TypeScript parser/transpile audit

The globally available TypeScript compiler parsed/transpiled all source TS/TSX files with diagnostics enabled.

Result:

- 173 files
- 0 syntax failures

### Runtime schedule invariant

The V2.16 schedule helper was transpiled and executed directly.

Input:

- timezone: UTC
- mode: `x_per_day`
- 3 videos/day
- first time: 18:00

Expected/observed slots:

- 18:00
- 20:00
- 22:00

## Dependency-aware gate

`npm ci --no-audit --no-fund` was attempted with a 120-second timeout.

Result: **BLOCKED — registry/dependency installation timed out**.

`node_modules` was not produced, so the following were not falsely reported as passing:

- `npm run typecheck`
- Vitest unit/integration suites
- Vite production build
- ESLint
- Playwright browser suite

Run on CI/a machine with npm registry access:

```bash
npm ci --no-audit --no-fund
npm run verify:release
```

For the DB concurrency/transaction tests, apply all migrations to a disposable Supabase project and configure:

```text
SUPABASE_TEST_URL
SUPABASE_TEST_SERVICE_ROLE_KEY
SUPABASE_TEST_ANON_KEY
RUN_SUPABASE_INTEGRATION=1
```

Then run:

```bash
npm run test:integration
```

## Important remaining production work

V2.16 fixes the critical workflow-consistency bugs, but two larger media-architecture items still need a dedicated follow-up rather than an unsafe partial rewrite:

1. Existing templates can still persist long-lived signed media URLs. A future media-reference migration should store durable asset IDs/storage paths and resolve fresh signed URLs at preview/render time.
2. `storeFinishedRender()` still buffers the provider MP4 before Supabase Storage upload. YouTube upload is now streamed, but provider-output-to-Storage streaming needs a separate implementation/certification path.

These are not hidden release passes; they remain explicit follow-up work.
