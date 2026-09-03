# V2.18 — Render Reliability & Cost Control

## Core changes
- Added streaming provider-output handoff to Supabase Storage (no unconditional full MP4 `arrayBuffer()`).
- Added provider reconciliation + timeout/cancellation handling.
- Added per-user render budgets and estimated per-render/monthly spend enforcement.
- Added exponential retry backoff and dead-letter state after configurable retry limits.
- Added idempotent active-attempt finalization safeguards.
- Added render priority and retry scheduling fields on campaign items.
- Added per-video `render_logs` event history.
- Added authenticated render cancellation and dead-letter recovery RPCs/server functions.
- Added Shotstack cancellation helper.
- Added V2.18 unit/integration coverage.
