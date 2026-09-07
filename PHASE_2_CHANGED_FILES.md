# Phase 2 changed files

- `worker/src/index.mjs` — worker execution upgraded to V2 compositor, bottom-to-top HTML layer assembly, native media download and V2 FFmpeg plan execution.
- `worker/src/render-v2.mjs` — new testable multi-layer FFmpeg graph planner and media downloader.
- `worker/src/render-v2.test.mjs` — worker V2 composition tests.
- `src/lib/ffmpeg-worker-manifest.server.ts` — frame-cadence HTML materialization, frame-cadence video descriptors, x/y/rotation/opacity/filter metadata, and audio gain envelopes.
- `src/lib/timeline-engine.ts` — optional render sample cadence for native video descriptors.
- `src/lib/render-capabilities.ts` — capability contract upgraded to native-ffmpeg-v2 / version 2.
- `src/lib/render-capabilities.test.ts` — V2 capability expectations.
- `src/lib/render-pipeline.server.ts` — removed worker-V1 campaign/document-video combination block.
- `PHASE_2_NATIVE_RENDERER_V2.md` — implementation/certification record.
- `PHASE_2_CHANGED_FILES.md` — this manifest.
