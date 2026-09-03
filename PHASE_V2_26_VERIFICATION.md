# V2.26 Verification

## Passed
- `npm run integrity`
  - 211 TS/TSX source files
  - 0 unresolved internal imports
- `npm run integrity:migrations`
  - 28 SQL migrations
  - V2.26 analytics/recommendation invariants present
- TypeScript parser/transpile audit
  - 211 TS/TSX files
  - 0 syntax diagnostics
- YouTube access-token helper regression check
  - no stale private helper references remain

## Analytics behavior
- Performance is de-duplicated to the latest observation for each published video before ranking.
- Each snapshot can carry views, likes, comments, impressions, CTR, retention proxy, first-three-second proxy, upload time, template, campaign, hook, CTA, topic/word and variant.
- YouTube Analytics API average-view-percentage is normalized to a 0..1 retention proxy when available.
- Data API metrics remain usable when Analytics API access is unavailable.
- CTR and direct first-three-second retention remain nullable because YouTube does not expose those metrics in every authorized API surface.
- Recommendation scoring combines logarithmic view scale, engagement, retention, first-three-second and CTR signals where available.
- Ranking confidence is reduced for tiny sample groups to limit one-video false winners.
- Recommendations identify the current template, hook, topic, upload-time and variant patterns worth testing next.
- Recommendation snapshots are persisted for later comparison.

## OAuth note
Existing connected channels must reconnect once to grant the newly added `yt-analytics.readonly` scope before deeper watch-time / average-view metrics can be synced.

## Dependency-aware gate
`npm run typecheck` remains blocked because dependencies are not installed in this environment:

`TS2688: Cannot find type definition file for 'vite/client'`

Full Vitest/build/lint/browser/live-YouTube certification is therefore not claimed.
