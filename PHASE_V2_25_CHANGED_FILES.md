# V2.25 — YouTube Intelligence & Publishing

Implemented real connected-channel publishing intelligence:
- YouTube Data API category lookup.
- Connected-channel playlist lookup.
- Durable per-channel upload defaults.
- Title/description publishing templates.
- Hashtag normalization, deduplication and limits.
- Default language/default audio language.
- Made-for-kids controls.
- Privacy defaults.
- Audience timezone setting and scheduling recommendation foundation.
- Channel statistics snapshots.
- Per-video post-publish performance snapshots.
- Thumbnail asset upload after video creation.
- Failed-upload repair with duplicate-side-effect protection.
- Publishing/analytics UI on YouTube connection screen.

Files added:
- `src/lib/youtube-intelligence.server.ts`
- `src/lib/youtube-intelligence.functions.ts`
- `src/lib/youtube-intelligence.test.ts`
- `supabase/migrations/20260903193000_v2_25_youtube_intelligence_publishing.sql`

Files updated:
- `src/lib/youtube-upload.functions.ts`
- `src/routes/_app/youtube-connect.tsx`
- `src/routes/_app/campaigns/$campaignId.tsx`
- `scripts/check-migrations.mjs`
