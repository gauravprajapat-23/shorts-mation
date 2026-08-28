# Editor V2.1 + V2.2 implementation

Implemented in this revision:

- `EditorDocumentV1` / `EditorDocumentV2` schema split with backwards-compatible `EditorDocument` union.
- V2 project metadata: canvas dimensions, FPS, duration, tracks and absolute timeline clips.
- Automatic V1 -> V2 migration when the template editor loads.
- Timeline synchronization keeps element timing as the source of truth so existing render/campaign code can continue reading scenes.
- Relative `startMs` and `durationMs` timing added to every editor element.
- Dedicated Zustand playback store for playhead, playback state and timeline zoom.
- Dedicated multi-track timeline component with scene lane, ruler, playhead, play/pause, frame step, zoom, seek, clip selection, clip move and left/right trimming.
- Numeric Start/Duration controls in the element properties panel.
- Canvas visibility respects clip timing.
- SVG preview rendering respects clip timing and evaluates animation time relative to the clip start.
- Migration tests added in `src/lib/editor-document-v2.test.ts`.

Deferred intentionally to later phases:

- Source-media trim (`sourceStartMs` / `sourceEndMs`) and split operations (V2.3).
- Full video/audio timeline synchronization (V2.3/V2.5).
- Shared frame evaluator across preview/FFmpeg/Shotstack (V2.4).
- Server renderer parity for every V2 timing feature (V2.4 compatibility work).

# Editor V2.3 implementation

Implemented in this revision:

- Source-aware video trimming with `sourceStartMs` / `sourceEndMs`.
- Cached `mediaDurationMs` for uploaded/URL videos when browser metadata is available.
- Clip playback speed (`playbackRate`) with duration recalculation.
- Clip volume, mute, fade-in and fade-out preview controls.
- Timeline `Split` action that is enabled only when the playhead is inside the selected video clip.
- Splitting creates two contiguous timeline clips and two contiguous source-media windows without duplicating media bytes.
- Dedicated pure video-editing engine in `src/components/editor/engine/video-editing.ts`.
- Unit coverage for left trim, right trim and split source-window math.
- Timeline trim handles now report their edit mode so video source timing follows the visual trim.
- Editor canvas video playback is synchronized to the global playhead rather than independent `<video autoPlay>` time.
- Paused scrubbing seeks to the exact source frame time; live playback applies the selected playback rate.
- Looping is constrained to the selected source window.
- Volume fade preview is evaluated from clip-relative timeline time.
- V1 migration initializes safe video source timing/playback defaults.

Still intentionally deferred:

- Shared frame evaluator / identical PreviewModal + FFmpeg + Shotstack behavior (V2.4).
- Server render support for composited video elements and source trims (V2.4).
- Full multi-track audio waveform/editor and ducking (V2.5).

## Editor V2.4 — Unified Preview / Render Timeline Engine

Implemented a shared, DOM-free timeline evaluator in `src/lib/timeline-engine.ts`.
It is now the canonical source for:

- effective scene boundaries and project duration
- active scene + local scene time
- clip start / duration visibility
- animation frame state (position, scale, rotation, opacity, blur)
- text reveal state
- camera state
- transition overlay opacity
- video source time, trim window, playback rate, volume fades, mute and loop state

### Rendering integration

- **Live editor canvas:** reads the evaluator for visibility, animated transforms, text reveal, video source time, camera movement and transition fade.
- **Preview modal:** composites real `<video>` layers under the evaluator-driven SVG overlay, so video clips are no longer placeholders in the main animated preview.
- **SVG renderer:** `buildSceneSvgAtTime()` now delegates scene/clip/animation timing to the shared evaluator.
- **Client FFmpeg renderer:** scene backgrounds and transparent SVG overlays are generated from the same evaluator; scene video elements are added as timed FFmpeg inputs with source trim, playback rate, fit, placement and opacity.
- **Shotstack server renderer:** scene video elements are now emitted as real Shotstack video clips instead of being skipped. Project timing/source trim/speed/placement/volume are generated from shared timeline descriptors.

### Timing dependency cleanup

Reveal/minimum-scene timing was moved into `src/lib/timeline-duration.ts`. This keeps migration/default-document code from importing the animation/editor rendering stack and avoids a runtime circular dependency.

### Tests added

- `src/lib/timeline-engine.test.ts`
- `src/lib/shotstack.server.test.ts`

These cover video source-time mapping, project clip timing and server video clip generation.

### Current V2.4 boundary

The client FFmpeg path now renders scene video visuals, but it intentionally does not mix arbitrary audio streams from every scene video clip yet. Global/background audio behavior remains intact. Full multi-track audio mixing belongs to Editor V2.5 (Audio Tracks + Waveforms + SFX + Ducking).

Shotstack can carry each scene video's own volume/mute setting because those are native video-asset properties.

## Editor V2.5 — Audio Tracks + Waveforms + SFX + Ducking

V2.5 introduces project-level audio clips (`audioClips`) and shared mix settings (`audioMix`). Music, voiceover, sound effects, and original audio now live on the same project timeline used by video/text elements. The editor preview, FFmpeg renderer and Shotstack builder use the same source ranges and mix rules, including fades, solo/mute and automatic music ducking while voiceover is active.

## Editor V2.6 — Professional Captions

- Added first-class project `captionClips` with a dedicated `captions` timeline track.
- Caption clips contain positioned styling plus word-level `startMs` / `endMs` timings.
- Added shared timeline caption evaluation (`activeWordIndex`, spoken/active/progress state).
- Added Bold Pop, Karaoke, Clean, Gaming, and Podcast caption presets.
- Added highlight, karaoke, pop, and minimal animation modes.
- Added caption clip drag/trim support in the multi-track timeline.
- Added caption properties for text, preset, animation, font/color, placement, timing, and manual per-word timings.
- Added automatic punctuation-aware word timing / retiming.
- Canvas and Preview/FFmpeg SVG rendering now use the shared caption evaluator.
- Shotstack output emits timed HTML caption segments at exact word boundaries.
- Existing V1/V2 projects migrate with empty caption clips by default.

## Editor V2.7 — Professional Text & Design System

V2.7 adds deterministic text auto-fit/max-line layout, richer typography controls, text/background gradients, advanced text cards, border/radius/padding/opacity controls, stronger outline/shadow/glow rendering and Shorts-specific presets. The same text layout/design data is consumed by the editor canvas, SVG/FFmpeg path and Shotstack HTML path.

Windows editor UX was also hardened: keyboard hints are platform-aware and advertise Ctrl+Z/Ctrl+Y/Ctrl+S/Ctrl+D on Windows while retaining Command shortcuts on macOS.
