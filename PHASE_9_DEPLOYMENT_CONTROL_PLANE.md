# Phase 9 — Deployment Control Plane, Autoscaling & Production Certification

## Production topology

Phase 9 separates the three operational roles:

- **Renderer fleet** — native Chromium/FFmpeg V6 workers. Queue and leases live in PostgreSQL; durable state/output live in R2.
- **Publisher fleet** — application-role pods that only drain `publish_jobs` and stream R2 ranges into YouTube resumable uploads.
- **Scheduler fleet** — application-role pods that materialize campaign deadlines, submit due renders, and reconcile render completion. PostgreSQL advisory locking elects one leader per scheduling pass.

`deploy/phase9/kubernetes.yaml` defines independent Deployments. `deploy/phase9/keda.yaml` scales renderer and publisher replicas from PostgreSQL queue depth.

## Autoscaling and admission

`control_plane_settings` stores min/max replica limits, jobs-per-replica targets, hard queue ceilings, and age pressure thresholds. `phase9_control_plane_health()` returns the queue and fleet state plus desired replica counts.

Autoscaling is advisory/infrastructure-driven; **admission is application-enforced**. When render queue depth reaches `render_max_queued`, scheduled campaign items remain durable but new render submission pauses. Existing queued jobs are not cancelled.

If the renderer queue lives in a separate PostgreSQL instance, application admission reads `/fleet` from the configured renderer and merges that queue state with Supabase control-plane policy.

## Operations dashboard

`/_app/operations` shows:

- render queue, active work, capacity, desired replicas and admission state;
- publisher queue, fleet capacity and desired replicas;
- recent scheduler leadership/runs;
- latest production certification result.

The page is restricted by `OPS_USER_IDS` and requires normal application authentication.

## Crash-drill repair

Phase 9 fixes a subtle exactly-once recovery bug: publish jobs that already persisted a `youtube_video_id` are still reclaimable after a crash. Both `claim_publish_jobs()` and `reconcile_stale_publish_jobs()` now allow recovery after `youtube_committed` and `campaign_committed` checkpoints.

Fault injection is disabled unless `ALLOW_PUBLISH_FAULT_INJECTION=1`. The dedicated publisher endpoint accepts a checkpoint/item pair only for staging certification.

## Mandatory production gate

`.github/workflows/production-release.yml` runs on version tags and manual production release. It first executes the normal static/repository renderer certification, then requires real staging credentials and runs `scripts/phase9-live-certify.mjs`.

The live gate requires:

1. materialized campaign content from the normal CSV/data-studio workflow;
2. R2 render output;
3. YouTube resumable upload completion;
4. public YouTube observability;
5. crash/recovery certification at **all five** durable checkpoints:
   - `source_verified`
   - `youtube_session_created`
   - `upload_progress`
   - `youtube_committed`
   - `campaign_committed`
6. exactly one durable `upload_attempts` row for each crash-drill campaign item.

`PHASE9_CRASH_ITEM_MAP` must contain a dedicated staging campaign-item UUID for each checkpoint. Using separate items lets every external side-effect boundary be exercised independently without mutating production jobs.

A successful run is stored in `production_certifications` and appears in the Operations dashboard.

## What cannot be certified offline

The real staging test requires a deployed app, staging PostgreSQL/Supabase, Cloudflare R2 credentials, a connected YouTube test channel, and videos that are allowed to become public. Phase 9 includes the live harness and makes it mandatory for production release, but it is not possible to truthfully execute that external certification without those credentials/resources.
