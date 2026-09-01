# Editor V2 Production Reliability Repair — Changed Files

- `src/lib/editor-document-v2.ts` — preserve late project clip starts; trim overruns only.
- `src/lib/editor-document-v2.test.ts` — regression coverage for final-project caption/effect timing.
- `src/lib/retention.ts` — post-CTA effective duration drives later absolute retention timing.
- `src/lib/retention.test.ts` — regression coverage for CTA extension + later interrupt scheduling.
- `src/lib/ffmpeg-render.ts` — deduplicated media inputs, per-render listeners, WASM FS cleanup, concurrent-render guard.
- `src/routes/_app/editor/$templateId.tsx` — screen-space caption parity with SVG/FFmpeg/full Preview.
- `scripts/check-source-integrity.mjs` — dependency-free internal import integrity gate.
- `package.json` — standard test/integrity/verify scripts.
- `.gitignore` — environment files ignored.
- `.env.example` — blank client/server environment contract.
- `.env` — removed from release artifact.
- `EDITOR_V2_PRODUCTION_AUDIT.md` — audit findings, repairs and certification limits.
