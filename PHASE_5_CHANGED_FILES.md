# Phase 5 changed files

- `worker/src/index.mjs` — durable scheduler, lease heartbeats, checkpoints, recovery, drain, fleet routes.
- `worker/src/queue-store.mjs` — PostgreSQL queue/lease/fleet implementation.
- `worker/src/queue-store.test.mjs` — pure lease/retry tests.
- `worker/src/asset-cache.mjs` — restart-safe cache reuse.
- `worker/src/render-v2.mjs` — restart-safe media staging reuse.
- `worker/scripts/durable-queue-certify.mjs` — two-client PostgreSQL integration certification.
- `worker/sql/001_durable_render_queue.sql` — deployable durable queue schema.
- `worker/docker-compose.phase5.yml` — PostgreSQL + two-worker reference deployment.
- `worker/package.json` — `pg` dependency and queue certification scripts.
- `worker/Dockerfile` — durable work volume and recovery defaults.
- `.github/workflows/renderer-parity.yml` — PostgreSQL queue certification added to production gate.
- `.env.example` — durable render infrastructure variables.
- `PHASE_5_PERSISTENT_QUEUE_CRASH_RECOVERY.md` — architecture/deployment/certification guide.
