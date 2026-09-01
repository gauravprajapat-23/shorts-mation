# Phase V2.13 — Production Security, Queue Integrity & Architecture Repair

## Security and tenant integrity
- `src/routes/api/public/hooks/process-campaign-queue.ts`: removed publishable/anon-key cron authorization; only `CRON_SECRET` is accepted.
- `supabase/migrations/20260901164500_v2_13_security_queue_integrity.sql`: closes private-template `is_default` escalation, enforces campaign/template/channel/item tenant ownership, adds queue indexes, immutable render/upload attempts, and atomic claim RPCs.
- `src/routes/api/public/hooks/render-callback.ts` + `src/lib/render-pipeline.server.ts`: per-attempt callback tokens, stale-attempt compare-and-set, provider re-query, and output-host allowlisting instead of trusting callback URLs.

## Queue integrity and idempotency
- Render and YouTube uploads are claimed atomically in Postgres.
- Attempt rows retain idempotency keys, provider references, timestamps, errors, and completion state.
- YouTube video IDs are persisted to the attempt before item finalization so crash recovery reconciles rather than re-uploading.
- Valid render callbacks can recover a provider job reference after a post-submit worker crash.

## Canonical rendering and runtime validation
- `src/lib/editor-document-schema.ts`: Zod runtime boundary validation for EditorDocument V1/V2 structure, geometry and timing.
- `src/lib/render-jobs.functions.ts`: removed the legacy first-scene renderer and now materializes V2.11 dynamic input and renders through the shared timeline/SVG engine.
- Editor load/save, server render submission, and campaign Test Render validate/materialize the document through the shared pipeline.

## Architecture
- `src/routes/_app/editor/$templateId.tsx` reduced from ~180 KB to ~42 KB.
- `src/components/editor/EditorSurface.tsx` owns canvas, preview, media/audio/caption/effect controls, panels and property surfaces.
- This is the first split; a later command/store extraction can now proceed without a single-file rewrite.

## MCP schema repair
- `get-campaign`: uses `video_file_name`, `schedule_at`, `youtube_url`.
- `list-assets`: uses the real `logo` enum instead of nonexistent `font`.
- `list-campaigns`: uses `draft | active | paused | completed | failed`.

## Tests
- `src/lib/editor-document-schema.test.ts`: runtime document validation regressions.
- `src/integration/v2-13-supabase.integration.test.ts`: opt-in real Supabase multi-user isolation and eight-way concurrent render-claim test.
- Run with `npm run test:integration` against an isolated test Supabase project.
