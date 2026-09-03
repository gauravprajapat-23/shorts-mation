# V2.26 — Analytics & Winning-Template Intelligence

## Added
- `src/lib/analytics-intelligence.ts`
  - confidence-weighted performance scoring
  - template/upload-time/hook/CTA/topic/variant ranking
  - engagement and retention-proxy support
  - automatic next-variation recommendations
  - attribution extraction from campaign content / V2.22 AI metadata
- `src/lib/analytics-intelligence.functions.ts`
  - authenticated analytics aggregation
  - latest-snapshot de-duplication
  - recommendation snapshot persistence
- `src/lib/analytics-intelligence.test.ts`
- `src/routes/_app/analytics.tsx`
  - Winning-Template Intelligence dashboard
  - best template / upload time / first-three-seconds hook proxy / topic
  - next-variation recommendation cards
  - copy-to-AI prompt + Data Studio handoff
  - per-video attribution table
- `supabase/migrations/20260903203000_v2_26_winning_template_intelligence.sql`
  - performance attribution fields
  - CTR/impression/retention/first-3-second nullable metrics
  - recommendation-run history

## Updated
- `src/lib/youtube-oauth.functions.ts`
  - YouTube Analytics readonly OAuth scope
- `src/lib/youtube-intelligence.server.ts`
  - YouTube Analytics report retrieval
  - average view duration / average view percentage / watch-time / subscriber metrics
- `src/lib/youtube-intelligence.functions.ts`
  - analytics sync now stores template, campaign, hook, CTA, topic/word, variant and upload time
  - Data API + Analytics API metrics merged into one canonical snapshot
- `src/components/app-shell.tsx`
  - Analytics navigation
  - mobile nav changed to horizontally scrollable layout to accommodate the additional destination
- `src/routeTree.gen.ts`
  - Analytics route registration
- `scripts/check-migrations.mjs`
  - V2.26 invariants
