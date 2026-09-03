# V2.20 — Template Marketplace & Template Builder UX

## Added
- `supabase/migrations/20260903143000_v2_20_template_marketplace.sql`
  - template categories, tags, public/private visibility
  - preview video, description, documentation
  - validation score + required variables
  - favorites
  - immutable version history
  - remix lineage
  - publish timestamps
  - safe `remix_template()` and `restore_template_version()` RPCs
- `src/lib/template-marketplace.ts`
  - marketplace categories
  - tag normalization
  - required-variable detection
  - product validation score
  - documentation generation
- `src/lib/template-marketplace.test.ts`

## Updated
- `src/routes/_app/templates/index.tsx`
  - Library / Marketplace / Favorites tabs
  - search + category filters
  - thumbnails and hover preview videos
  - favorites
  - duplicate/remix
  - product setup modal
  - validation score and required-variable visibility
  - documentation
  - sample CSV generation
  - public/private publishing
  - version history + restore
- `src/routes/_app/templates/new.tsx`
  - category, visibility, tags, marketplace description
  - generated docs/validation metadata at creation
- `src/routes/_app/editor/$templateId.tsx`
  - refreshes validation score + required variables whenever document content is saved
- `src/lib/template-io.ts`
  - portable exports/imports preserve marketplace metadata
- `scripts/check-migrations.mjs`
  - V2.20 migration invariants
