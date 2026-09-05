# Analytics & Channel Intelligence Upgrade

## What changed

The Analytics page is now a full channel-performance workspace rather than a small winner summary.

### Whole-channel sync
- YouTube sync now enumerates the channel Uploads playlist, so videos uploaded outside ShortsForge can also be tracked.
- App-created campaign videos are merged with all channel video IDs and fetched in Data API batches.
- YouTube Analytics report paging was expanded beyond the previous 500-row ceiling.
- Analytics sync now requests the full historical range and stores title, publish date and thumbnail metadata for non-campaign videos.
- Thumbnail impressions / CTR are requested when the connected channel/API surface exposes them; unsupported channels simply show missing coverage.

### Channel overview
The page shows:
- channel subscribers, views and published-video count
- deltas across stored channel snapshots
- tracked views, likes, comments
- weighted engagement
- average retention / average percentage viewed
- average view duration
- estimated watch time
- subscribers gained
- metric-coverage indicators

### Channel growth
Stored YouTube channel snapshots are visualized as a trend so repeated syncs build a historical channel-growth view.

### Optimization diagnostics
The page automatically identifies situations such as:
- low average retention
- weak engagement / CTA response
- low CTR when available
- high-retention videos with weak distribution
- high-view videos with weak retention

Each diagnosis includes a concrete content action.

### Breakdown intelligence
Analytics are grouped by:
- template
- topic / word
- campaign
- audience-local upload hour

Each group compares video count, views, engagement and retention.

### All videos
A server-paginated table now supports:
- every tracked channel video
- thumbnail + title
- views, likes, comments
- engagement
- retention
- average view duration
- watch time
- CTR
- upload date
- template and topic attribution
- search
- template filter
- campaign filter
- sorting
- 10/25/50/100 rows per page
- per-video analytics drawer
- direct YouTube link

External videos that were not created by ShortsForge remain visible and are labeled as external/no campaign rather than being discarded.

## Verification
- `npm run integrity` — PASS
- `npm run integrity:migrations` — PASS

No database migration was required because the existing V2.25/V2.26 analytics snapshot tables already contain the required fields.
