# V2.21 — Automation Data Studio

## New
- `src/routes/_app/data-studio.tsx`
  - spreadsheet-style table editor
  - add/delete/select rows, add custom columns
  - bulk TSV paste from Excel / Google Sheets
  - CSV/JSON import with interactive column mapping
  - CSV/JSON export
  - template-variable mapping
  - field/type/required validation and per-row/per-cell error indicators
  - duplicate video filename and duplicate generated-content detection
  - auto-fill columns including daily schedule progression
  - durable asset media picker cells
  - search/filter rows
  - dynamic per-row materialized preview
  - saved/reloadable table drafts
  - Fill to 100 + Generate N videos
- `src/lib/automation-data-studio.ts`
  - template-to-column schema generation
  - spreadsheet row model
  - validation
  - import/export
  - bulk paste
  - auto mapping/fill
  - canonical campaign-item conversion
- `src/lib/automation-data-studio.test.ts`
- `src/lib/data-studio.functions.ts`
  - authenticated server generation boundary
  - 1–100 row server-side enforcement
  - duplicate/schedule validation
  - canonical transactional campaign creation
- `supabase/migrations/20260903153000_v2_21_automation_data_studio.sql`
  - persistent Data Studio drafts with RLS
  - template/channel ownership checks
  - generated-campaign linkage

## Updated
- `src/components/app-shell.tsx`
  - Data Studio navigation on desktop/mobile
- `src/routes/_app/campaigns/new.tsx`
  - Data Studio shortcut
  - repaired stale `c.id` / `u.user.id` item payload regression
- `src/routeTree.gen.ts`
  - Data Studio route included for the packaged source tree
- `scripts/check-migrations.mjs`
  - V2.21 migration invariants
