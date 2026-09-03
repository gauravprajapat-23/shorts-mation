# Application UI Repair Audit

## Fixed in this pass

### Campaign details schedule visibility
- Campaign Details previously displayed only `campaign_items.schedule_at`.
- Rows already synchronized to YouTube can have the authoritative time in `youtube_publish_at`.
- The page now displays `youtube_publish_at ?? schedule_at`.
- Times are formatted in the campaign's configured timezone and YouTube-synchronized differences are labelled.
- Campaign items now refresh every 15 seconds and expose query errors instead of silently showing stale/empty rows.

### Campaign Details responsiveness
- Header actions wrap on narrow screens.
- Queue table has a local horizontal scroller and a safe minimum width.
- Page padding is responsive.

### Global page header
- Header title/action layout now stacks on mobile.
- Long titles wrap rather than pushing actions off-screen.
- Actions can use full width on small devices.

### Mobile application navigation
- Desktop icon rail remains on tablet/desktop.
- Phones use a six-item bottom navigation bar so content does not permanently lose 64px of horizontal space.
- Main content reserves space for the mobile navigation.

### Campaign list
- Added loading/error/retry states.
- Added horizontal table scrolling.
- Removed obsolete direct deletion of protected queue items; campaign deletion now relies on DB cascades.

### New Campaign wizard
- Corrected copy from "Five-step" to "Six-step".
- Stepper can scroll horizontally on narrow devices instead of clipping.
- Template cards collapse to one column on very small screens.
- YouTube/template queries now distinguish loading, backend failure and real empty results.

### Dashboard
- Supabase failures are now propagated instead of being interpreted as zero data.
- Added retryable error state.
- Stats and recent campaign rows scale better on narrow screens.

### Templates
- Added visible loading/error/retry state.
- Template grids support very narrow phones without squeezed two-column cards.

### Assets
- Added visible loading/error/retry state.
- Improved responsive grid.
- Removed stale `font` asset icon mapping and added the real `logo` type.

### YouTube connection
- Added visible connection-query error state.
- Connection layout stacks correctly on phones.
- Disconnect action becomes full-width on small screens.

### Automation status
- Added loading/error/retry state.
- Stats reflow 2 → 3 → 6 columns.
- Header metadata wraps instead of overflowing.

### Settings
- "Delete all data" no longer tries to directly delete protected queue rows introduced by V2.15.
- It deletes parent campaigns and lets database cascades remove queue/attempt history.
- Errors are surfaced instead of reporting success after a partial wipe.

## Remaining UI improvements recommended
- Convert dense Campaign Details queue rows into mobile cards rather than relying on horizontal scrolling.
- Add skeleton loaders shared across screens for visual consistency.
- Introduce a shared QueryState component for loading/error/empty UI to remove repeated markup.
- Add route-level accessibility pass: aria labels for icon-only controls, focus rings, modal focus trapping, and escape-key handling.
- Add Playwright viewport tests at 320, 375, 768, 1024 and 1440 widths once dependencies/browser tooling are available.
- Profile Editor surface and timeline specifically on small devices; the editor remains the most complex responsive screen.
