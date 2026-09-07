-- Phase 6: R2-backed distributed render storage metadata.
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS output_object_key text;
ALTER TABLE render_queue_jobs ADD COLUMN IF NOT EXISTS storage jsonb NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO render_queue_meta(key,value) VALUES('schema_version','2')
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
