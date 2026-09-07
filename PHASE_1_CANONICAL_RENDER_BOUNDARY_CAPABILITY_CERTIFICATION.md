# Phase 1 — Canonical Render Boundary & Capability Certification

## Objective

Make the production render path consume the Phase 0 canonical composition contract, prevent known native-worker fidelity failures before queue submission, and establish a code-backed capability inventory before renderer V2 work begins.

## Production boundary now enforced

`campaign/template + automation data -> materializeCampaignRenderComposition() -> CanonicalComposition -> asset hydration/signing -> re-canonicalize -> native capability preflight -> manifest -> worker`

Renderer-specific code no longer receives the raw template/editor document directly from automation materialization.

## Native worker V1 capability truth

The capability matrix is based on `worker/src/index.mjs`, not merely on fields emitted by `ffmpeg-worker-manifest.server.ts`.

| Feature | Phase 1 certification | Reason |
| --- | --- | --- |
| Scene timing / solid backgrounds | Exact at manifest semantics | Scene HTML clips use canonical timeline ranges. |
| Text, rect/ellipse, image HTML layers | Approximate | SVG `foreignObject` + `rsvg-convert`; installed fonts/CSS/image loading are environment dependent. |
| Element animation / keyframes | Approximate | Shared timeline state is sampled into short HTML clips. |
| Camera / transitions / effects | Approximate | State is baked into sampled HTML; not pixel/frame certified. |
| Captions | Approximate | Phase 1 now bakes captions into the same scene HTML frame. |
| One full-duration full-canvas cover video | Approximate | Worker loops one full-frame video and ignores most manifest video semantics. |
| Positioned / trimmed / timed / transformed video | Unsupported | Worker uses the video as a full-frame looping background. |
| Multiple video segments/layers | Unsupported | Worker explicitly rejects more than one video asset. |
| Timeline audio mixer/clips/ducking | Unsupported | Manifest emits audio clips but worker never consumes them. |
| One campaign soundtrack | Supported | Worker consumes `timeline.soundtrack`. |
| Triangle/star/line shapes | Unsupported | Current HTML shape serializer only reproduces rect/ellipse geometry. |

## Submission behavior

Known unsupported compositions now fail **before manifest upload / worker submission** with an error beginning:

`Native renderer preflight failed before submission:`

Approximate capabilities do not block the render. Their warnings are written into `render_attempts.metadata_json` with canonical composition and capability versions so later parity work can identify what was rendered under which contract.

## Preview/export mismatch reduced in Phase 1

Previously captions were emitted as separate HTML tracks, while native worker V1 chooses only one HTML clip for each frame. This meant a caption could replace the scene HTML rather than overlay it. Phase 1 bakes active caption HTML into the scene HTML frame and removes separate caption tracks from the native-worker manifest.

The production pipeline also no longer promotes a document video element into a second `backgroundVideoUrl`, which could duplicate one source into two worker video assets and trigger the worker's hard multi-video error.

## Explicitly deferred

Phase 1 does **not** replace SVG/rsvg frame production, implement a Chromium renderer, implement timeline audio mixing in the native worker, or provide true multi-layer video composition. Those are renderer implementation changes for later phases. This phase makes current limitations explicit and safe instead of silently producing incorrect exports.
