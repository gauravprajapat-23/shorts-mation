# Phase V2.14 — Real Release Certification & Rendering Parity

## Added
- `src/lib/render-certification.ts` — canonical golden-manifest + browser render budget helpers.
- `src/lib/render-certification.test.ts` — renderer timing/media golden parity fixtures.
- `src/lib/long-timeline.stress.test.ts` — opt-in 10-minute/240-scene/10k-frame stress test.
- `src/lib/campaign-mapping.ts` + test — preserves structured array/object campaign values.
- `scripts/check-migrations.mjs` — migration ordering/security invariant check.
- `scripts/run-vitest-with-env.mjs` — Windows-safe env-gated Vitest runner.
- `scripts/playwright-release-e2e.mjs` — real browser auth/template smoke gate.
- `scripts/browser-memory-profile.mjs` — Chromium JS-heap profiling harness.
- `scripts/verify-fresh-supabase.mjs` — disposable Postgres/Supabase migration + integration gate.
- `scripts/staging-release-certification.mjs` — release gate orchestrator and external staging evidence checker.

## Repaired
- Campaign field mapping no longer stringifies arrays/objects before automation rendering.
- Legacy browser auto-render is disabled by default in production and cannot claim rows with an active canonical server render attempt.
- Integration/stress scripts no longer rely on POSIX-only `ENV=1 command` syntax.

## Release commands
- `npm run verify:release`
- `npm run verify:fresh-supabase`
- `npm run test:e2e`
- `npm run profile:browser`
- `npm run certify:staging`
