# Phase 5 — Persistent Render Queue, Crash Recovery & Distributed Workers

## Production boundary
The worker no longer stores queue ownership or job state in process memory. PostgreSQL is the durable source of truth. Runtime memory contains only ephemeral process handles for jobs currently owned by that process.

## Durable tables
- `render_queue_jobs`: idempotency key, lifecycle state, progress, durable checkpoint, attempts, cancellation, output path, lease owner/expiry.
- `render_worker_nodes`: worker heartbeat, draining state, concurrency and renderer version.
- `render_job_events`: claim/retry/callback audit trail.
- `render_queue_meta`: queue schema version.

The worker creates the schema idempotently at startup. `worker/sql/001_durable_render_queue.sql` is also provided for controlled database provisioning.

## Claiming and leases
Workers claim with `SELECT ... FOR UPDATE SKIP LOCKED`. The winning worker writes its ID and an expiring lease. Active workers renew their leases. If a process/node disappears, stale reconciliation or another claimant can recover the expired row. No healthy second worker can claim an unexpired job.

Default timing:
- lease: 45 s
- lease renewal: about every 15 s
- node heartbeat: 10 s
- stale reconciliation: 15 s

## Retry and idempotency
`idempotency_key` is UNIQUE in PostgreSQL. Repeated POST `/jobs` returns the existing durable job instead of creating a duplicate. Failed jobs use durable `retry_wait` state with exponential backoff. `MAX_RETRIES=2` means one initial run plus two retry claims.

## Resume checkpoints
A job has a stable directory under `RENDER_WORK_ROOT/jobs/<job-id>` and persists checkpoint state in PostgreSQL. Recovery reuses:
- downloaded manifest
- SHA-256 asset cache
- already-rendered PNG frames
- media staging files

Encoding is rerun unless a durable completed state already exists; this avoids trusting a partial MP4 left by a killed FFmpeg process.

## Shared render volume
For one host with multiple containers, the included Compose file uses one shared Docker volume. For workers on different machines, `RENDER_WORK_ROOT` must be backed by a shared POSIX filesystem (NFS/EFS/Filestore/etc.) or a later object-storage checkpoint layer. Without a shared volume, the queue still recovers jobs, but another host may need to regenerate local checkpoints.

Completed output URLs are DB-backed and token-protected. When using a load balancer across workers, every node serving `/outputs/:id` must mount the same `RENDER_WORK_ROOT`, or routing must remain sticky to the owning shared-volume pool.

## Graceful drain
SIGTERM/SIGINT changes the worker node to `draining`, stops new claims, rejects new submissions with 503, and waits for active renders until `RENDER_DRAIN_TIMEOUT_MS`. If the deadline is exceeded, child FFmpeg processes are terminated and durable leases recover on another worker after expiry.

## Cross-node cancellation
DELETE `/jobs/:id` sets `cancel_requested=true` in PostgreSQL. If the HTTP request reaches a different node, the owning node observes the flag during its lease renewal and terminates the active child process.

## Fleet health
Authenticated endpoints:
- `GET /health`: local state plus durable queue/node summary.
- `GET /ready`: 503 while draining; suitable for load-balancer readiness.
- `GET /fleet`: queue status counts and all registered workers with online/draining state, heartbeat, concurrency, version and active jobs.

## Configuration
Required:
- `FFMPEG_WORKER_SECRET`
- `RENDER_DATABASE_URL` (or `DATABASE_URL`)

Important:
- `RENDER_WORK_ROOT`
- `RENDER_WORKER_ID`
- `RENDER_DB_SSL=require|disable`
- `RENDER_LEASE_SECONDS`
- `RENDER_HEARTBEAT_MS`
- `RENDER_RECONCILE_MS`
- `RENDER_DRAIN_TIMEOUT_MS`

For Supabase, use a server-side/direct Postgres connection string suitable for long-lived backend workers. Never expose this connection string to the web client.

## Local two-worker deployment
`worker/docker-compose.phase5.yml` starts PostgreSQL plus two renderer workers against one durable queue and shared work volume.

## Certification
Unit tests:
`npm --prefix worker test`

Real PostgreSQL queue certification:
`RENDER_TEST_DATABASE_URL=postgresql://... npm --prefix worker run certify:queue:integration`

The integration certification uses two queue clients and proves:
1. duplicate idempotency submissions collapse to one job;
2. an active lease prevents a second owner;
3. an expired lease is taken over by another worker;
4. the recovered job reaches one durable completed row.

GitHub `Renderer production gate` now runs this database certification before the existing golden renderer parity suite.
