# Account creation fix + Editor V2.9

## Authentication
- Fixed email signup redirecting into protected routes when Supabase requires email confirmation and returns no session.
- Added explicit confirmation-pending UI and existing-email handling.
- Switched Google account creation/sign-in to Supabase OAuth using a public `/auth` return target so session restoration completes before protected route loaders run.
- Preserves `next` redirects and surfaces provider/auth errors.

## Editor V2.9
- Expanded transitions: zoom, whip, blur, flash, glitch.
- Added image/video filter presets and brightness/contrast/saturation/exposure/temperature/tint/blur/vignette/grain controls.
- Added project-level effect clips: vignette, grain, light leak, flash, glitch.
- Added Effects timeline row, drag/trim support, selection and property editing.
- Unified transition/effect evaluation through `src/lib/effects.ts` + timeline engine.
- SVG/FFmpeg frame export renders effect overlays and transition state.
- FFmpeg video clips receive media color adjustments.
- Shotstack maps compatible media presets to documented clip filters and renders project overlay effects in sampled HTML frames.
