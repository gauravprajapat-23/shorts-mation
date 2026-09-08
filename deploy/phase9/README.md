# Phase 9 deployment control plane

Renderer, publisher and scheduler are independently deployable. Renderer pods use the native V6 worker image. Publisher and scheduler pods may use the same application image but run different internal queue loops, so they scale independently from user-facing web replicas.

KEDA reads durable PostgreSQL queue depth and scales renderer/publisher Deployments. The application-side `phase9_control_plane_health()` RPC remains authoritative for admission ceilings and the Operations dashboard. Configure `OPS_USER_IDS` for dashboard access.

For production, use separate secrets for render R2/database credentials and application/Supabase/Google OAuth credentials. Do not expose CRON_SECRET or R2 keys to the browser.
