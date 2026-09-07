# Phase 7 — Render Scheduler, Campaign Dispatch & Exactly-Once Publishing

## Architecture

The campaign automation loop is now four durable stages:

1. `dispatchUpcomingCampaignItems()` materializes lead-time deadlines for the next 24 hours and creates one `publish_jobs` row per rendered campaign item.
2. `submitDueRenders()` continues using deterministic render idempotency (`render:<item>:retry:<n>`).
3. `collectFinishedRenders()` only marks a campaign item rendered after the Phase 6 worker reports its R2-backed output complete.
4. `processPublishQueue()` leases durable publishing jobs independently from rendering and resumes the same YouTube upload after process/server failure.

The cron hook runs dispatch before and after render collection so a render that becomes R2-ready in the current tick can immediately enter the publishing queue.

## YouTube OAuth origin repair

`getYouTubeAuthUrl` no longer requires `PUBLIC_APP_URL`. It reads the live TanStack Start request and passes that origin into `youtubeOAuthAppBaseUrl(requestOrigin)`. `PUBLIC_APP_URL` remains an optional override for reverse-proxy/custom-domain deployments.

## Exactly-once publishing model

Each campaign item receives one durable `publish_jobs` row and one deterministic upload-attempt key:

`youtube:<campaign-item-id>:publish-v1`

A fresh nonce is no longer used for each retry. The same `upload_attempts` row therefore owns the YouTube resumable session across restarts.

Before any new YouTube resumable session is created, the publisher:

- reconciles a previously persisted `youtube_video_id`;
- searches the channel's recent uploads for a private Shorts-Mation metadata tag (`sm_<item-id>`), covering the crash window where YouTube committed the video but the app had not persisted the id;
- if a prior resumable session exists, queries its offset using `Content-Range: bytes */<total>`;
- resumes from the server-confirmed offset rather than re-uploading from byte zero.

Uploads use 8 MiB resumable chunks. The persisted session URL is written before video bytes are sent, and upload progress is written to attempt metadata. The durable publish-job lease is renewed during chunk progress.

## Durable publish queue

`publish_jobs` states:

`pending -> leased -> uploading -> completed`

Failures transition to `retry_wait`, with exponential backoff. Quota/rate-limit failures receive a longer retry delay and do not burn through the normal terminal-attempt budget. Worker crashes are recovered by `reconcile_stale_publish_jobs()` after lease expiry.

Only one worker can claim a ready publishing job because the database claim uses `FOR UPDATE SKIP LOCKED`.

## Scheduled publishing

When the publish time is sufficiently in the future, the uploader sends the video to YouTube as `private` with YouTube's `publishAt`. The application separately reconciles scheduled rows after their publish time and only marks them `uploaded` after YouTube reports `privacyStatus=public`.

## Release / operational notes

Run the campaign hook from a trusted cron scheduler with `CRON_SECRET`. It is safe to call repeatedly and after process restarts. Recommended cadence is once per minute.

The application's render completion still copies the authoritative worker output into the existing `renders` storage abstraction before publishing. Phase 6 guarantees the worker only reports completion after the MP4 is durable in R2, so publishing never races an incomplete worker output.
