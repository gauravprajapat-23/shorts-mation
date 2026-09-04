## Goal
Move renders from static SVG frames to animated MP4s, and ship a starter library of high-effort animated templates (Quiz, Motivation, plus a couple more) so YouTube Shorts feel produced rather than slideshow-y.

## What changes

### 1. Animated element model
Extend `EditorElement` in `src/lib/types.ts` with an optional `animations` block:
```ts
animations?: {
  in?:  { type: "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "scale" | "pop" | "blur"; delayMs: number; durationMs: number; easing?: "linear" | "easeOut" | "easeInOut" | "spring" };
  out?: { type: ...; startMs: number; durationMs: number };
  loop?: { type: "float" | "pulse" | "shake" | "wiggle" | "kenburns"; amplitude?: number; speedMs?: number };
}
```
Scenes get an optional `transition` ("cut" | "fade" | "slideLeft" | "wipe") and a `cameraMove` ("none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight") for Ken-Burns feel.

Text elements get optional `reveal: "none" | "typewriter" | "wordByWord" | "charStagger"` so quiz questions/motivation lines land word by word.

### 2. Animated preview in the editor
`src/lib/template-preview.tsx` gets a sibling `AnimatedTemplatePreview` that runs a `requestAnimationFrame` timeline and applies per-element `transform`/`opacity` per frame. The static `TemplatePreview` stays for template cards (thumbnails). The editor's Preview modal switches to the animated version with a play/pause/scrub bar.

### 3. Render pipeline (animated MP4)
`src/lib/ffmpeg-render.ts` currently burns one PNG overlay over the background. Replace with a per-frame pipeline:
- Compute total frames (`durationMs * fps`, fps=30).
- For each frame, rasterize the scene at time `t` to a PNG via the same animation math used in the editor (shared helper `renderSceneToSvg(doc, tMs, vars)`).
- Feed frames to ffmpeg.wasm as `frame_%05d.png` and encode with `-framerate 30 -i frame_%05d.png` composited over the background video (existing scale/crop filter).
- Keep resolution/quality options. Add a hard cap (e.g. 15s at 30fps = 450 frames) so wasm memory stays sane; warn in the UI above that.

Progress reporting: emit progress as `rasterized/total * 0.6 + ffmpegProgress * 0.4`.

### 4. Test-render page
`src/routes/_app/campaigns/$campaignId.test-render.tsx` already calls `renderMp4`; it just needs to pass `doc` + `durationMs` instead of a single SVG string. Update the call site and the fallback doc in `render-jobs.functions.ts` so server-side "fake" jobs still produce a still preview (unchanged), but real client renders are animated.

### 5. Starter animated templates
Add a seed set in `src/lib/starter-templates.ts` and a "Load starter templates" button on `src/routes/_app/templates/index.tsx` (inserts into the `templates` table for the current user). Four templates, each ~10–12s, 9:16, with layered animations:

1. **Quiz — "Guess the ___"**
   - Scene 1 (3s): category chip pops in, question types on word-by-word, 3s countdown ring animates.
   - Scene 2 (4s): four answer cards slide up staggered, correct answer scales + glows.
   - Scene 3 (3s): "Follow for more" CTA with pulsing arrow.
   - Variables: `category`, `question`, `optionA..D`, `correct`.

2. **Motivation — "Stoic Punch"**
   - Ken-Burns background, big serif quote reveals line by line, author fades in, red accent bar wipes across, end card with handle.
   - Variables: `quote`, `author`, `handle`.

3. **Did-You-Know / Fact**
   - Number counts up, fact text char-stagger reveal, floating icons loop, swipe transition to source line.
   - Variables: `stat`, `unit`, `fact`, `source`.

4. **Top 5 Countdown**
   - Ranks 5→1 slide in from right with a whoosh accent bar, each holds 1.5s, final #1 scales with confetti dots loop.
   - Variables: `title`, `item1..5`.

Each template is authored as a full `EditorDocument` with animation metadata so users can duplicate and remix.

### 6. Editor UI for animations
Right panel gets an "Animate" tab (next to existing property controls) with:
- In-animation dropdown + delay/duration sliders
- Out-animation dropdown
- Loop effect dropdown
- For text: reveal mode dropdown
- Scene-level: transition + camera move dropdowns
Live preview updates as user tweaks.

## Technical notes (details)
- Animation math lives in one place: `src/lib/animate.ts` exports `computeElementTransform(el, tMs)` returning `{ x, y, scale, rotation, opacity }`. Reused by editor preview, template-preview animated variant, and the ffmpeg per-frame rasterizer.
- Easing helpers (`easeOutCubic`, `spring`) implemented inline; no new deps.
- Per-frame rasterization uses the existing `svgToPngBlob` approach in `ffmpeg-render.ts`, called in a loop with `await` so we don't block the main thread; yield to UI every ~10 frames.
- Duration cap: 15s @ 30fps for wasm; expose as constant.
- Background video is still scaled/cropped once via ffmpeg's `overlay` filter chain; overlay input becomes an image sequence rather than a single PNG.
- No backend/schema changes needed — animations live inside `template_json` which is already `jsonb`.

## Files touched
- `src/lib/types.ts` — extend element/scene types
- `src/lib/animate.ts` — new, shared animation math
- `src/lib/template-preview.tsx` — add `AnimatedTemplatePreview`
- `src/lib/ffmpeg-render.ts` — per-frame pipeline
- `src/lib/starter-templates.ts` — new, 4 seed templates
- `src/lib/render-jobs.functions.ts` — pass through animated preview shape
- `src/routes/_app/editor/$templateId.tsx` — Animate tab + animated preview modal
- `src/routes/_app/templates/index.tsx` — "Load starter templates" action + animated card thumbnails (optional: keep static thumbs for perf)
- `src/routes/_app/campaigns/$campaignId.test-render.tsx` — call updated `renderMp4`

## Out of scope
- Audio-reactive animation, particle systems, 3D — can come later.
- Server-side rendering of MP4 (still fully client-side via ffmpeg.wasm).
