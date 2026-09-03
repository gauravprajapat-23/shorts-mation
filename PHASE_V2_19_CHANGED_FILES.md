# V2.19 — Campaign Operations 2.0

## Campaign operations
- Added transactional `duplicate_campaign` RPC and authenticated server action; duplicates open as drafts and copy video inputs/settings without copying render/upload attempts or output state.
- Added independent per-video `is_paused` operational state with pause/resume RPC.
- Render and upload provider claim functions now exclude paused videos.
- Worker candidate discovery also excludes paused rows to avoid queue-scan waste.
- Added bulk retry-selected RPC for failed queue rows.

## Campaign details
- Added campaign progress percentage and progress bar.
- Added remaining videos, paused videos, conflict count and ETA.
- Added Calendar and Duplicate actions.

## Calendar operations
- Added `/campaigns/$campaignId/calendar` 35-day operations calendar.
- Video cards are draggable between days to reschedule.
- Existing scheduled YouTube videos use the existing remote synchronization command.
- Displays campaign timezone and device-timezone preview.
- Schedule conflicts are highlighted.

## Queue control center
- Added filters: all, failed-only, paused, processing and scheduled.
- Added row selection and Retry selected.
- Existing bulk auto-spread/reschedule now operates on selected rows when a selection exists.
- Added per-video Pause/Resume controls on desktop and mobile.
- Added conflict indicators, paused indicators and calendar navigation.

## Activity
- Upgraded backend log list to a visual Campaign Activity Timeline with event severity, time and video identity.

## Shared logic / schema
- Added `src/lib/campaign-operations.ts` and tests for progress, remaining count, ETA and conflict detection.
- Updated Supabase campaign-item generated types for V2.18/V2.19 operational columns.
- Added V2.19 migration and integration contract coverage.
