-- Phase 5 durable render queue. The worker also bootstraps this schema idempotently at startup.
CREATE TABLE IF NOT EXISTS render_queue_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS render_queue_jobs (
  id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  attempt_id text,
  manifest_url text NOT NULL,
  callback_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  error text,
  output_token text NOT NULL,
  output_path text,
  worker_id text,
  lease_expires_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  run_attempts integer NOT NULL DEFAULT 0,
  cancel_requested boolean NOT NULL DEFAULT false,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_cache jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS render_queue_jobs_claim_idx ON render_queue_jobs(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS render_queue_jobs_lease_idx ON render_queue_jobs(lease_expires_at) WHERE lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS render_worker_nodes (
  worker_id text PRIMARY KEY,
  hostname text,
  status text NOT NULL,
  max_concurrency integer NOT NULL,
  active_jobs integer NOT NULL DEFAULT 0,
  version text NOT NULL,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS render_job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES render_queue_jobs(id) ON DELETE CASCADE,
  event text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS render_job_events_job_idx ON render_job_events(job_id, created_at DESC);
