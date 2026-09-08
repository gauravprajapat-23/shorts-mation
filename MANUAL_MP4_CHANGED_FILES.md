# Manual MP4 + Download — Changed Files

- `src/lib/automation.functions.ts` — manual queue command enhancements, authoritative worker polling/finalization, secure download URL generation, re-render support.
- `src/lib/render-pipeline.server.ts` — manual paused-item claim path and exported legacy finalizer.
- `src/lib/r2-publish-source.server.ts` — attachment-capable presigned R2 GET URLs.
- `src/routes/_app/campaigns/$campaignId.tsx` — Render MP4, Download, and Re-render actions on campaign rows.
- `src/routes/_app/campaigns/$campaignId.test-render.tsx` — browser ffmpeg.wasm removed; production native manual MP4 flow with live status/download.
- `src/lib/ffmpeg-worker-pipeline.test.ts` — regression expectation updated to production-native manual render path.
- `supabase/migrations/20260907235900_manual_mp4_render_download.sql` — service-role-only manual render claim RPC that can render paused rows without weakening automation pause behavior.
- `scripts/manual-render-certify.mjs` — focused static certification.
- `package.json` — `certify:manual-render` and release-gate integration.
- `MANUAL_MP4_RENDER_DOWNLOAD.md` — behavior/security documentation.
