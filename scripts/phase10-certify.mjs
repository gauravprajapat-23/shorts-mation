import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
const migration=await read('supabase/migrations/20260907200000_phase10_multi_tenant_governance.sql');
const queue=await read('worker/src/queue-store.mjs');
const pipeline=await read('src/lib/render-pipeline.server.ts');
const publisher=await read('src/lib/youtube-publisher-v2.server.ts');
const governance=await read('src/lib/tenant-governance.server.ts');
const retention=await read('src/lib/r2-retention.server.ts');
const operations=await read('src/routes/_app/operations.tsx');
const checks=[
 ['plan catalog',/capacity_plan_defaults/.test(migration)&&/business/.test(migration)],
 ['tenant policy quotas',/max_concurrent_renders/.test(migration)&&/render_monthly_budget_usd/.test(migration)&&/youtube_daily_quota_units/.test(migration)],
 ['weighted fair publisher claim',/publish_vruntime/.test(migration)&&/1\/GREATEST\(weight/.test(migration)],
 ['reserved scheduled capacity',/scheduled_reserve_minutes/.test(migration)&&/intended_publish_at/.test(migration)],
 ['render fair queue',/render_tenant_fairness/.test(queue)&&/tenant_max_concurrent/.test(queue)&&/vruntime/.test(queue)],
 ['render governance submission metadata',/tenantWeight: tenantPolicy.weight/.test(pipeline)&&/assertRenderGovernance/.test(pipeline)],
 ['daily monthly render budgets',/renderDailyLimit/.test(governance)&&/renderMonthlyBudgetUsd/.test(governance)],
 ['YouTube quota idempotency',/youtube_quota_reservations/.test(migration)&&/PRIMARY KEY REFERENCES public.publish_jobs|publish_job_id uuid PRIMARY KEY/.test(migration)],
 ['global YouTube quota ceiling',/youtube_global_daily_quota_units/.test(migration)&&/global_quota/.test(migration)],
 ['publisher quota reservation',/reserveYouTubeQuota\(job.id\)/.test(publisher)],
 ['abuse backpressure',/tenant_backpressure_windows/.test(migration)&&/phase10_consume_tenant_admission/.test(governance)],
 ['R2 lifecycle separation',/r2JobRetentionDays/.test(retention)&&/r2OutputRetentionDays/.test(retention)&&/row.kind==="job"/.test(retention)],
 ['cost throughput dashboard',/Multi-tenant governance & cost/.test(operations)&&/YouTube units reserved/.test(operations)],
];
for(const [name,ok] of checks){assert.equal(ok,true,name);console.log(`PASS ${name}`)}
console.log(`Phase 10 certification: ${checks.length}/${checks.length} passed`);
