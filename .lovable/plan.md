## Goal of v1

Ship a clickable, production-style SaaS shell for the YouTube Bulk Video Automation Platform. Every page, table, and workflow exists end-to-end. Rendering and real YouTube API calls are **stubbed** behind a clean service contract so a worker/Edge Function can plug in later without UI changes.

## Tech & stack decisions

- TanStack Start (React 19 + TS) + Tailwind v4 + shadcn/ui (already scaffolded).
- Lovable Cloud (Supabase) for auth, DB, storage, RLS, and Edge Function stubs.
- Auth: email/password + Google (managed broker). YouTube OAuth is **separate** (a per-user connection record, tokens stored server-side only).
- Design: **Cinematic dark mode** direction (locked) — `#0A0A0A` canvas, `#141414` panels, `#262626` borders, `#FF0033` brand, Inter + Plus Jakarta Sans.

## Information architecture (routes)

Public:
- `/` — marketing landing (one screen, CTA to sign in)
- `/auth` — sign in / sign up (email + Google)
- `/auth/youtube/callback` — YouTube OAuth return handler

Authenticated (under `_authenticated/`):
- `/dashboard` — KPIs, channel status, onboarding checklist, recent jobs, quick actions
- `/youtube-connect` — connect/disconnect YouTube, channel card, warnings
- `/templates` — grid of user + default templates
- `/templates/new` — picker (blank / from default)
- `/editor/$templateId` — full editor (see below)
- `/campaigns` — list
- `/campaigns/new` — 8-step automation wizard
- `/campaigns/$campaignId` — detail (stats, settings, controls)
- `/campaigns/$campaignId/queue` — queue table
- `/assets` — uploaded images / videos / audio / logos
- `/settings` — profile, timezone, delete data
- `/billing-placeholder`

## Core modules

### 1. Shell
Sticky left icon rail (Dashboard, Templates, Campaigns, Assets, Settings), compact top bar with breadcrumb and primary action, dark cinematic theme tokens.

### 2. Dashboard
KPI cards (campaigns, generated, scheduled, uploaded, failed), connected-channel card, onboarding checklist (5 steps, persists in `profiles.onboarding_state`), recent jobs feed, quick-action buttons.

### 3. YouTube Connect
- "Connect YouTube" → opens Google OAuth (server route initiates, callback at `/api/public/youtube/callback`) — **stubbed**: callback creates a fake `youtube_connections` row so the UI flows work end-to-end.
- Connected card (avatar, name, channel ID), disconnect, API-verification warning banner, refresh-token architecture documented in code comments.

### 4. Template Editor (full editor scope)
Canva-style, dark. Layout matches the selected direction:
- Top bar: back, name (inline edit), undo/redo, save, preview, export
- Left rail (collapsible): Templates / Text / Images / Shapes / Backgrounds / Audio / Variables
- Center canvas: 9:16 default, 16:9 and 1:1 toggle, zoom, snap guides, safe area, direct on-canvas text editing, drag/resize/rotate, layer selection
- Right panel: element properties (font, size, weight, color, shadow, stroke, bg, animation in/out, timing)
- Bottom: scene timeline (multi-scene), per-scene duration, audio track lane, bulk preview thumbnail strip from current campaign data
- Variables: `{{quote}} {{author}} {{question}} {{option_a..d}} {{answer}} {{title}} {{date}} {{day_count}} {{cta}} {{video_file_name}}` — drag onto canvas to bind text element
- Template stored as JSON (`templates.template_json`) — engine-agnostic schema (scenes → layers → bindings) ready for FFmpeg/Remotion later
- Actions: duplicate, delete, save as default

State: Zustand store per editor session with undo/redo history stack.

### 5. Default ready templates
Seeded via migration as `is_default=true` rows owned by `NULL` user, readable by all `authenticated`: Motivational Quote, Daily Thought, Quiz, Did You Know, Countdown, Before/After, Product Promo, Spiritual Thought, Educational Tip, News Shorts. Each has placeholder variables, sample design JSON, default music slot.

### 6. JSON/CSV import + validation
- Upload screen accepts `.json` or `.csv`
- Parser supports the exact JSON schema in the brief and the CSV column list
- Validation report screen: total rows, missing required fields per row, duplicate `video_file_name`, invalid ISO schedule dates, invalid privacy enum, unknown template — each editable inline before commit
- Sample JSON + sample CSV download buttons

### 7. Bulk Generator
Wizard step inside campaign-new: select template → upload file → upload assets → map columns → preview grid (per-row mini canvas render using template JSON + row data in-browser SVG/HTML) → click any to expand, edit, mark ready/not ready → "Start Automation". Statuses: pending / rendering / rendered / upload_pending / uploading / uploaded / scheduled / failed.

### 8. Audio system
Asset manager with type filter, per-row override via CSV `audio_file_name`, global per-campaign default, volume / trim / loop / fade / mute-original flags persisted in `audio_json`.

### 9. Automation wizard (8 steps)
Channel → Template → File → Assets → Mapping → Preview → Schedule rules → Confirm. Schedule rules: use file's `schedule_at`, OR X-per-day at HH:MM, skip weekends, start/end date, timezone, retry on failure.

### 10. Campaign management
List, detail (status, counts, settings, queue link), pause/resume/stop/duplicate/delete, export CSV report.

### 11. Upload queue
Table per spec — thumbnail, file name, title, template, status pill (color-coded), schedule time, YouTube status, error message, retry, view logs drawer, open YouTube link.

## Database schema (Supabase migration)

Tables exactly per brief: `profiles`, `youtube_connections`, `templates`, `campaigns`, `campaign_items`, `assets`, `automation_logs`, plus `user_roles` (admin/user enum + `has_role` security-definer fn per project rules).

Every public table gets explicit `GRANT` to `authenticated` + `service_role`. RLS enabled on every table; policies scoped to `auth.uid()`. Templates also allow `SELECT` where `is_default = true`. Token columns store **encrypted text** (pgp_sym_encrypt with a `YOUTUBE_TOKEN_ENCRYPTION_KEY` secret) — never readable by client; only Edge Functions/admin paths decrypt.

Trigger: `on_auth_user_created` → insert `profiles` row.

Storage buckets:
- `assets` (private) — user-uploaded images / video / audio / logos
- `renders` (private) — generated MP4s
- `thumbnails` (private with signed-URL helper) — preview frames

### Server-side stubs (Edge Functions / server routes)

All under stubs that return shaped responses + insert logs so UI is fully exercised:
- `youtube-oauth-start` / `youtube-oauth-callback` (server routes under `/api/public/youtube/*`)
- `refresh-youtube-token`
- `parse-upload-file` (server fn, real implementation)
- `validate-campaign-data` (real)
- `create-render-jobs` (real — inserts `campaign_items`)
- `render-video` (stub: marks rendered, fake URL)
- `upload-to-youtube` (stub: fake YT video id)
- `schedule-youtube-video` (stub)
- `process-automation-queue` (stub cron-style fn)
- `retry-failed-job`, `pause-campaign`, `resume-campaign`

## UX details
Onboarding checklist on dashboard, tooltips, sample file downloads, demo campaign seeded on first sign-in, "Test render 1 video" button, default-private safety toggle, progress bars, logs drawer, consent checkbox before starting automation, delete-all-data action in settings.

## Out of scope for v1 (explicit)
- Real FFmpeg/Remotion rendering — engine plugs into `render-video` later
- Real YouTube Data API uploads — interface plugs into `upload-to-youtube`
- Billing
- Real-time collaborative editing
- Mobile editor (responsive viewer only)

## Build order

1. Cloud + schema + RLS + seeds + storage buckets + roles
2. Theme tokens (dark cinematic) + shell + auth pages
3. Dashboard + Templates list + YouTube Connect (stubbed)
4. JSON/CSV parser + validator + sample downloads
5. Campaign wizard + campaigns list/detail + queue table
6. Template editor (canvas, panels, variables, multi-scene, audio lane)
7. Edge Function stubs + automation queue logs + retry/pause/resume
8. Settings, assets manager, polish, empty states, onboarding checklist persistence

Given the size, I'll deliver this in a single large initial build then iterate. Expect follow-up turns to refine the editor and any rough edges.
