# V2.22 — AI Content Generation Layer

## New
- `src/lib/ai-content.server.ts`
  - OpenAI + OpenRouter credential resolution
  - structured campaign dataset schema from template variables
  - prompt construction grounded in selected template, market, and audience
  - server-only provider requests with 90-second timeout
  - structured JSON campaign parsing
  - provider key verification
- `src/lib/ai-content.functions.ts`
  - encrypted BYOK AI settings
  - AI settings status
  - authenticated campaign dataset generation
  - accessible-template authorization
  - 1–100 row generation boundary
  - generation-run audit records and usage metadata
- `src/lib/ai-content.server.test.ts`
- `supabase/migrations/20260903170000_v2_22_ai_content_generation.sql`
  - encrypted AI provider configuration
  - generation history / usage records

## Updated
- `src/routes/_app/settings.tsx`
  - OpenAI/OpenRouter provider selector
  - model configuration
  - encrypted API-key setup/removal
- `src/routes/_app/data-studio.tsx`
  - natural-language AI Campaign Generator
  - target market + audience + video count
  - example: “Create 30 animal letter-match Shorts for US kids”
  - generated rows land in Data Studio for review before campaign creation
- `src/lib/automation-data-studio.ts`
  - AI content columns: hook, CTA, captions, quiz question/answer, scene data
  - AI metadata preserved into campaign content
- `scripts/check-migrations.mjs`
  - V2.22 invariants
