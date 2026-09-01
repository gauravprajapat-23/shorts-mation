import type { EditorEffectClip, MediaColorAdjustments, MediaFilterPreset, SceneTransition } from "@/lib/types";

export type ResolvedMediaLook = Required<Pick<MediaColorAdjustments, "brightness"|"contrast"|"saturation"|"exposure"|"temperature"|"tint"|"blur"|"vignette"|"grain">>;

const PRESETS: Record<MediaFilterPreset, Partial<ResolvedMediaLook>> = {
  none: {}, cinematic: { contrast: 1.14, saturation: 0.9, temperature: 0.08, vignette: 0.22 },
  warm: { saturation: 1.08, temperature: 0.2 }, cold: { saturation: 0.96, temperature: -0.2 },
  "high-contrast": { contrast: 1.32, saturation: 1.08 }, vintage: { contrast: 0.92, saturation: 0.72, temperature: 0.17, grain: 0.18, vignette: 0.16 },
  mono: { saturation: 0, contrast: 1.08 }, gaming: { contrast: 1.16, saturation: 1.32 },
  podcast: { contrast: 1.08, saturation: 0.92, temperature: 0.05 }, documentary: { contrast: 1.12, saturation: 0.78, grain: 0.08, vignette: 0.12 },
};

export function resolveMediaLook(preset: MediaFilterPreset = "none", own: MediaColorAdjustments = {}): ResolvedMediaLook {
  const p = PRESETS[preset] ?? {};
  return {
    brightness: own.brightness ?? p.brightness ?? 1, contrast: own.contrast ?? p.contrast ?? 1,
    saturation: own.saturation ?? p.saturation ?? 1, exposure: own.exposure ?? p.exposure ?? 0,
    temperature: own.temperature ?? p.temperature ?? 0, tint: own.tint ?? p.tint ?? 0,
    blur: own.blur ?? p.blur ?? 0, vignette: own.vignette ?? p.vignette ?? 0, grain: own.grain ?? p.grain ?? 0,
  };
}

export function cssFilterForLook(look: ResolvedMediaLook): string {
  const brightness = Math.max(0, look.brightness * Math.pow(2, look.exposure));
  const hue = look.tint * 10;
  // Temperature is approximated using sepia + hue rotation for cross-renderer portability.
  const sepia = Math.abs(look.temperature) * 0.22;
  const tempHue = look.temperature >= 0 ? -8 * look.temperature : 12 * -look.temperature;
  return `brightness(${brightness}) contrast(${look.contrast}) saturate(${look.saturation}) sepia(${sepia}) hue-rotate(${hue + tempHue}deg) blur(${Math.max(0, look.blur)}px)`;
}

export type TransitionFrame = { opacity:number; tx:number; ty:number; scale:number; blur:number; flash:number; glitch:number };
export function evaluateTransition(kind: SceneTransition = "cut", localMs: number, durationMs = 420): TransitionFrame {
  const p = Math.max(0, Math.min(1, localMs / Math.max(1, durationMs)));
  const inv = 1 - p;
  const base: TransitionFrame = { opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0, flash: 0, glitch: 0 };
  switch (kind) {
    case "fade": return { ...base, opacity: p };
    case "slideLeft": return { ...base, tx: 220 * inv };
    case "slideRight": return { ...base, tx: -220 * inv };
    case "wipe": return { ...base, opacity: Math.min(1, p * 1.5), tx: 80 * inv };
    case "zoom": return { ...base, opacity: p, scale: 1.22 - 0.22 * p };
    case "whip": return { ...base, opacity: Math.min(1, p * 2), tx: 520 * inv, blur: 18 * inv };
    case "blur": return { ...base, opacity: p, blur: 24 * inv };
    case "flash": return { ...base, flash: Math.max(0, 1 - p * 2.5) };
    case "glitch": return { ...base, opacity: Math.min(1, p * 1.8), glitch: inv };
    default: return base;
  }
}

export type EffectState = EditorEffectClip & { localMs:number; progress:number; visible:boolean };
export function evaluateEffectClips(clips: EditorEffectClip[], tMs: number): EffectState[] {
  return (clips ?? []).map((clip) => {
    const localMs = tMs - clip.startMs;
    const visible = !clip.hidden && localMs >= 0 && localMs <= clip.durationMs;
    return { ...clip, localMs, progress: Math.max(0, Math.min(1, localMs / Math.max(1, clip.durationMs))), visible };
  });
}
