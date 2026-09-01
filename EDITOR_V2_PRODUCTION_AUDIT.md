# Editor V2 Production Audit & Reliability Repair

## Scope

Release-certification pass over the Editor V2.1–V2.12 source. No new product feature phase was added. The audit focused on migration safety, timeline boundaries, preview/export parity, browser FFmpeg reliability, automation/dynamic-scene invariants, source/import integrity, environment hygiene, and an executable verification chain.

## Repaired production issues

### 1. Project clip end-boundary timing corruption
`syncV2Timeline()` forced caption/audio/effect clips to start at least 100 ms before project end. A clip intentionally starting in the final 100 ms was silently moved earlier. The normalization now preserves the requested start time and trims only the overrun duration. Zero-length clips at/after the exact project end are removed.

### 2. Retention timing drift after CTA extension
The V2.12 retention preset could extend a CTA to its minimum duration but continued advancing its absolute timing cursor using the pre-extension duration. Later retention effects could therefore be scheduled too early or omitted. All following timing now uses the post-preset effective scene duration.

### 3. Caption editor/export camera mismatch
The interactive editor canvas rendered project captions inside the scene camera transform, while SVG/FFmpeg/full Preview rendered captions in screen space. Captions are now outside the camera transform in the editor as well.

### 4. FFmpeg duplicate media inputs
Keyframed videos are sampled into many render segments. The browser exporter previously fetched and wrote the same physical video once for every sampled segment. Video and audio inputs are now deduplicated by source and reused by all segment-level filters.

### 5. FFmpeg WASM virtual-filesystem leak
Frame PNGs, media inputs, overlays and `out.mp4` were left in the singleton FFmpeg filesystem after each export. Repeated exports could grow WASM memory continuously. Every per-render file is now tracked and deleted in `finally`, including failed exports.

### 6. FFmpeg listener accumulation
Per-render progress listeners accumulated on the singleton instance, and the old logger was tied only to the first load. Log/progress listeners are now registered per export and removed in `finally`.

### 7. Concurrent FFmpeg export collision
Two browser exports could share the same singleton filesystem and overwrite fixed filenames. Concurrent exports now fail fast with a clear error instead of risking corrupted output.

### 8. Environment-file release hygiene
The archive contained a populated `.env`, and `.gitignore` did not ignore environment files. The populated file is removed from the release source, `.env`/`.env.*` are ignored, and a comprehensive blank `.env.example` documents client/server configuration keys.

### 9. Missing verification scripts
The package had typecheck/build/lint scripts but no standard test or aggregate release check. Added:

- `npm run test`
- `npm run test:editor`
- `npm run integrity`
- `npm run verify`

`integrity` is dependency-free and checks all internal TS/TSX imports, including Vite query imports.

## Added/updated regression coverage

- V1 -> V2 migration invariant remains intact.
- Project caption/effect clips in the final project milliseconds preserve their true start and are trimmed rather than shifted.
- V2.12 CTA duration extension is included when scheduling later pattern interrupts.
- Existing V2.11 dynamic object-array scene materialization was executed in the audit runtime and verified.

## Verification evidence

### Passed

- Dependency-free source integrity: 148 TS/TSX files, 0 unresolved internal imports.
- TypeScript parser/transpile diagnostics: 148 TS/TSX files, 0 syntax failures.
- Executed pure-runtime invariants: V1->V2 migration, late project-clip normalization, V2.11 dynamic scene expansion, V2.12 CTA/retention timing.
- Confirmed ffmpeg.wasm 0.12 API supports `off()` and `deleteFile()` used by the cleanup lifecycle.

### Blocked by environment

`npm ci --no-audit --no-fund` timed out in this execution environment. Because `node_modules` could not be restored, the dependency-aware verification chain cannot be truthfully certified here.

`npm run typecheck` currently stops before source checking with:

```
TS2688: Cannot find type definition file for 'vite/client'
```

This is caused by the missing installed Vite dependency/type package, not a parser error in the source tree.

Consequently Vitest, Vite production build, and ESLint were not claimed as passed. After dependencies are available, run `npm run verify` as the release gate.

## Release gate

Do not label the deployment fully production-certified until this exact source passes `npm ci` followed by `npm run verify` in CI or a machine with dependency registry access. The source-level blockers found during this audit have been repaired; dependency-aware build/test/lint remains the outstanding certification step.
