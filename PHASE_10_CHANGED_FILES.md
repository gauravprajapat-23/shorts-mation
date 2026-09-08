# Phase 10 changed files

## Added
- `supabase/migrations/20260907200000_phase10_multi_tenant_governance.sql`
- `src/lib/tenant-governance.server.ts`
- `src/lib/r2-retention.server.ts`
- `worker/sql/003_tenant_fair_queue.sql`
- `worker/scripts/tenant-fairness-certify.mjs`
- `scripts/phase10-certify.mjs`
- `.github/workflows/phase10-governance.yml`
- `.github/workflows/production-release.yml` (restored because the Phase 9 archive omitted the hidden workflow directory)
- `PHASE_10_MULTI_TENANT_CAPACITY_GOVERNANCE.md`
- `PHASE_10_CHANGED_FILES.md`

## Modified
- `src/lib/render-pipeline.server.ts`
- `src/lib/ffmpeg-worker.server.ts`
- `src/lib/youtube-publisher-v2.server.ts`
- `src/lib/r2-publish-source.server.ts`
- `src/lib/operations.functions.ts`
- `src/routes/_app/operations.tsx`
- `src/routes/api/public/hooks/process-scheduler.ts`
- `worker/src/queue-store.mjs`
- `worker/package.json`
- `package.json`
- `.env.example`
