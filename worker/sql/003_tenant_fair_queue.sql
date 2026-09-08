-- Phase 10 render-worker fair-share schema.
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS tenant_weight numeric(8,3) NOT NULL DEFAULT 1;
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS tenant_max_concurrent integer NOT NULL DEFAULT 1;
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS priority_at timestamptz;
CREATE INDEX IF NOT EXISTS render_queue_jobs_tenant_active_idx ON render_queue_jobs(tenant_id,status,lease_expires_at);
CREATE INDEX IF NOT EXISTS render_queue_jobs_priority_idx ON render_queue_jobs(status,priority_at,available_at);
CREATE TABLE IF NOT EXISTS render_tenant_fairness (
  tenant_id text PRIMARY KEY,
  vruntime numeric(20,6) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO render_queue_meta(key,value) VALUES('schema_version','3') ON CONFLICT(key) DO UPDATE SET value='3',updated_at=now();
