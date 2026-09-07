# Phase 1 changed files

- `src/lib/render-materialization.ts` — canonical automation materialization boundary.
- `src/lib/render-materialization.test.ts` — canonical materialization coverage.
- `src/lib/render-capabilities.ts` — native worker V1 static/dynamic capability certification and blocking preflight.
- `src/lib/render-capabilities.test.ts` — unsupported/approximate capability coverage.
- `src/lib/ffmpeg-worker-manifest.server.ts` — accepts CanonicalComposition and bakes captions into scene HTML.
- `src/lib/render-pipeline.server.ts` — canonicalize after hydration/signing, run capability preflight before submission, persist capability metadata, avoid duplicate document/background video promotion.
- `src/lib/render-jobs.functions.ts` — interactive test-render materialization uses canonical V2 boundary.
- `PHASE_1_CANONICAL_RENDER_BOUNDARY_CAPABILITY_CERTIFICATION.md` — capability inventory and architectural notes.
- `PHASE_1_CHANGED_FILES.md` — this manifest.
- `PHASE_1_VERIFICATION.md` — verification status.
