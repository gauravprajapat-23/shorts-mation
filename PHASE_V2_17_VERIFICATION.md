# V2.17 Verification

## Passed in this environment

- `npm run integrity`
  - 179 TS/TSX files
  - 0 unresolved internal imports
- `npm run integrity:migrations`
  - 20 SQL migrations
  - unique ordering
  - V2.13, V2.15, V2.16 and V2.17 invariants present
- Global TypeScript `transpileModule` syntax audit
  - 179 files
  - 0 syntax failures
- Dependency-independent durable-media runtime invariant
  - expired legacy Supabase signed URL -> storage path recovery: PASS
  - signed URL -> durable `asset://<uuid>` normalization: PASS
  - image/audio fresh URL hydration: PASS
  - missing durable reference detection: PASS

## Dependency-aware gate

Attempted:

```bash
npm ci --no-audit --no-fund
```

Result: timed out after 120 seconds. `node_modules` was not produced, so the following were not falsely marked green:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run lint`
- Supabase integration tests

The V2.17 integration suite is included at `src/integration/v2-17-durable-assets.integration.test.ts` and is intended to run against the migrated staging/test Supabase instance through the existing integration-test gate.

## Deployment order

1. Apply all Supabase migrations including `20260903113000_v2_17_durable_asset_architecture.sql`.
2. Deploy the application code.
3. Run `npm run verify:release` in CI.
4. Run `npm run test:integration` against staging Supabase.
5. Open Assets and verify quota/health data after the migration backfills legacy template references.
