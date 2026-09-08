# Phase 10 — Multi-Tenant Capacity Governance, Fair Scheduling & Cost Controls

## Objective
Prevent a single tenant from consuming the renderer/publisher fleet while preserving urgent scheduled-video capacity and keeping render/storage/YouTube spend observable and bounded.

## Capacity plans
`capacity_plan_defaults` provides operational defaults for `free`, `starter`, `pro`, and `business`. Billing is not coupled to this table: a billing/webhook layer should call the service-role-only `phase10_assign_capacity_plan(user_id, plan_key)` function when a subscription changes.

Each tenant policy controls:
- weighted fair-share weight;
- maximum concurrent renders and publishes;
- daily/monthly render counts;
- daily/monthly estimated render-cost budgets;
- daily YouTube upload and estimated quota-unit allocation;
- render submissions/minute backpressure;
- scheduled reserve window;
- R2 ephemeral-job and final-output retention.

## Weighted-fair rendering
Render submissions now carry `tenantId`, `tenantWeight`, `tenantMaxConcurrent`, and `priorityAt` to the native renderer. The durable PostgreSQL queue keeps `render_tenant_fairness.vruntime`. Each claim advances virtual runtime by `1 / tenant_weight`, while active claims cannot exceed `tenant_max_concurrent`.

Jobs whose `priority_at` is within 45 minutes receive reserved urgency before ordinary fair-share ordering. Tenant concurrency still applies.

A real PostgreSQL certification lives at `worker/scripts/tenant-fairness-certify.mjs` and is run by `.github/workflows/phase10-governance.yml` with PostgreSQL 16.

## Weighted-fair publishing
`claim_publish_jobs()` now selects through tenant virtual runtime (`tenant_fairness_state.publish_vruntime`) instead of global FIFO alone. Near-publish deadlines are prioritized using each tenant's `scheduled_reserve_minutes`, but max concurrent publisher jobs and daily upload limits are still enforced.

## Render budgets and abuse protection
Before a render is submitted, `assertRenderGovernance()` checks:
- per-minute submission backpressure;
- daily render count;
- monthly render count;
- daily estimated render spend;
- monthly estimated render spend.

`capacity_usage_events` is idempotent by reference and records render submission/completion, publish completion, YouTube quota reservations, and R2 bytes deleted.

## YouTube quota allocation
`youtube_quota_reservations` is unique by publish job. A retry therefore reuses the same reservation rather than repeatedly consuming quota allocation.

Reservation enforces both:
- tenant daily upload/quota limits; and
- a global control-plane daily quota ceiling with a system reserve.

`YOUTUBE_ESTIMATED_UPLOAD_QUOTA_UNITS` is deliberately configurable because actual API quota accounting can change independently of this application.

## R2 lifecycle cleanup
A successful R2 render enqueues two durable cleanup records:
1. job-state cleanup after `r2_job_retention_days`; and
2. final MP4 cleanup after `r2_output_retention_days`.

The job cleanup explicitly skips `/output/`, so checkpoint/frame cleanup cannot remove the final publishable MP4 early. The scheduler leader drains a bounded number of cleanup records per tick using `R2_CLEANUP_PER_TICK`.

## Operations dashboard
`/_app/operations` now includes governance/cost metrics:
- managed tenant policies;
- throttled publish jobs;
- renders completed today;
- estimated render cost today;
- YouTube quota units reserved today;
- R2 cleanup backlog;
- top monthly tenant consumers with render/publish counts and estimated cost.

## Release gates
`npm run certify:phase10` checks the Phase 10 invariants and is now included in `verify:release` and the production-release workflow.

The dedicated Phase 10 CI workflow uses a real PostgreSQL 16 service to test weighted fairness, tenant concurrency isolation, and urgent scheduled priority on the actual durable render queue.

## Offline limitations
This workspace does not have the root frontend dependency tree, PostgreSQL, Docker, staging R2 credentials, or a YouTube test-channel connection. Therefore:
- root `npm run typecheck/build/lint` was not rerun;
- the real PostgreSQL Phase 10 fairness certification is provided but not executed locally;
- the Phase 9 live CSV → public YouTube certification remains an external production-release requirement.
