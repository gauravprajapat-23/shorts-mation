# Manual MP4 Render + Download

Manual video generation now uses the same canonical Chromium + FFmpeg render queue used by automated campaigns. The previous `ffmpeg.wasm` browser composition path is no longer used by the campaign Test Render page.

## User flow

1. Open a campaign and choose **Manual MP4**.
2. Pick a campaign row.
3. Click **Generate MP4**.
4. The page polls the authoritative native worker and displays durable progress.
5. When the worker completes, the app immediately finalizes the R2 object without waiting for cron.
6. Click **Download MP4** to receive a short-lived signed R2 download target.
7. A completed, unpublished row can be **Re-rendered** manually.

Manual generation is allowed for paused campaign rows through a separate service-role-only `claim_render_item_manual` RPC. Normal automation claims still respect `is_paused = false`.

## Security

The download server function queries the campaign item through the authenticated Supabase client/RLS boundary before creating a signed URL. R2 credentials never reach the browser. Signed URLs expire after 15 minutes. Legacy Supabase-render outputs use Supabase signed download URLs.

## Output profile

The existing production manifest is used: 1080p, 25 FPS, H.264/AAC via the native Chromium + FFmpeg worker. Assets, captions, timeline audio, video layers, transitions, and canonical composition rules are therefore identical to automated production rendering.
