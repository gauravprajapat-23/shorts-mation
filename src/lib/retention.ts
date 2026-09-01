import type { EditorDocumentV2, EditorEffectClip, EditorScene, RetentionPresetId, SceneRole, TextElement, VisualRhythmSettings } from "@/lib/types";
import { effectiveSceneDurationMs } from "@/lib/timeline-duration";

export type RetentionSuggestion = {
  id: string;
  sceneId?: string;
  atMs: number;
  kind: "hook" | "micro-zoom" | "caption-emphasis" | "pattern-interrupt" | "b-roll" | "cta";
  message: string;
  severity: "info" | "recommended";
};

export const RETENTION_PRESETS: Record<RetentionPresetId, VisualRhythmSettings> = {
  balanced: { preset: "balanced", enabled: true, microZoomEveryMs: 3500, patternInterruptEveryMs: 6500, captionEmphasis: "medium", transitionIntensity: "medium", ctaLeadMs: 2500 },
  "fast-viral": { preset: "fast-viral", enabled: true, microZoomEveryMs: 2200, patternInterruptEveryMs: 4200, captionEmphasis: "high", transitionIntensity: "high", ctaLeadMs: 2200 },
  story: { preset: "story", enabled: true, microZoomEveryMs: 5000, patternInterruptEveryMs: 8500, captionEmphasis: "medium", transitionIntensity: "subtle", ctaLeadMs: 3000 },
  educational: { preset: "educational", enabled: true, microZoomEveryMs: 4500, patternInterruptEveryMs: 7000, captionEmphasis: "high", transitionIntensity: "medium", ctaLeadMs: 2800 },
  minimal: { preset: "minimal", enabled: true, microZoomEveryMs: 8000, patternInterruptEveryMs: 12000, captionEmphasis: "low", transitionIntensity: "subtle", ctaLeadMs: 3000 },
};

export function normalizeRetention(input?: Partial<VisualRhythmSettings>): VisualRhythmSettings {
  const preset = input?.preset ?? "balanced";
  return { ...RETENTION_PRESETS[preset], ...input, preset };
}

export function inferSceneRole(scene: EditorScene, index: number, count: number): SceneRole {
  if (scene.role) return scene.role;
  const text = `${scene.name} ${scene.elements.filter((e): e is TextElement => e.type === "text").map((e) => e.text).join(" ")}`.toLowerCase();
  if (/subscribe|follow|comment|like|cta|learn more|link/.test(text)) return "cta";
  if (/result|reveal|payoff|answer|finally/.test(text)) return "payoff";
  if (index === 0) return "hook";
  if (index === count - 1) return "cta";
  if (/why|how|step|tip|fact|reason|value/.test(text)) return "value";
  return index === 1 ? "context" : "value";
}

export function analyzeRetention(doc: EditorDocumentV2): RetentionSuggestion[] {
  const settings = normalizeRetention(doc.retention);
  if (!settings.enabled) return [];
  const out: RetentionSuggestion[] = [];
  let cursor = 0;
  let lastInterrupt = 0;
  doc.scenes.forEach((scene, index) => {
    const duration = effectiveSceneDurationMs(scene);
    const role = inferSceneRole(scene, index, doc.scenes.length);
    if (index === 0 && role !== "hook") out.push({ id: `hook_${scene.id}`, sceneId: scene.id, atMs: cursor, kind: "hook", severity: "recommended", message: "Make the opening scene a Hook to clarify the first-second payoff." });
    if (duration >= settings.microZoomEveryMs && !scene.retention?.microZoom) out.push({ id: `zoom_${scene.id}`, sceneId: scene.id, atMs: cursor + Math.min(1200, duration / 3), kind: "micro-zoom", severity: "info", message: "Add a subtle micro-zoom to prevent a static visual stretch." });
    const hasVisualMedia = scene.elements.some((el) => el.type === "video" || el.type === "image");
    if ((role === "value" || role === "pattern-interrupt") && !hasVisualMedia) out.push({ id: `broll_${scene.id}`, sceneId: scene.id, atMs: cursor + Math.min(900, duration / 3), kind: "b-roll", severity: "recommended", message: "This information-heavy beat has no image/video layer. Consider B-roll or a visual proof layer." });
    if (cursor + duration - lastInterrupt >= settings.patternInterruptEveryMs && role !== "cta") {
      out.push({ id: `interrupt_${scene.id}`, sceneId: scene.id, atMs: cursor + Math.min(duration * .6, duration - 200), kind: "pattern-interrupt", severity: "recommended", message: "Consider a B-roll cut, flash, whip, or layout change here." });
      lastInterrupt = cursor + duration;
    }
    if ((role === "hook" || role === "payoff" || role === "cta") && !scene.retention?.captionEmphasis) out.push({ id: `caption_${scene.id}`, sceneId: scene.id, atMs: cursor, kind: "caption-emphasis", severity: "info", message: `Use stronger caption emphasis in this ${role} scene.` });
    cursor += duration;
  });
  const cta = doc.scenes.find((s, i) => inferSceneRole(s, i, doc.scenes.length) === "cta");
  if (!cta) out.push({ id: "cta_missing", atMs: Math.max(0, cursor - settings.ctaLeadMs), kind: "cta", severity: "recommended", message: "No CTA scene detected. Add a concise CTA near the end." });
  return out;
}

function transitionFor(preset: RetentionPresetId, index: number): EditorScene["transitionIn"] {
  if (index === 0) return "cut";
  if (preset === "fast-viral") return (["whip", "zoom", "flash", "glitch"] as const)[index % 4];
  if (preset === "educational") return index % 3 === 0 ? "zoom" : "fade";
  if (preset === "story") return index % 4 === 0 ? "blur" : "fade";
  if (preset === "minimal") return "fade";
  return index % 3 === 0 ? "zoom" : "fade";
}

export function applyRetentionPreset(doc: EditorDocumentV2, preset: RetentionPresetId, makeId: (prefix: string) => string): EditorDocumentV2 {
  const settings = RETENTION_PRESETS[preset];
  let cursor = 0;
  const effects: EditorEffectClip[] = [...(doc.effectClips ?? []).filter((fx) => !fx.id.startsWith("retention_"))];
  const scenes = doc.scenes.map((source, index) => {
    const role = inferSceneRole(source, index, doc.scenes.length);
    const duration = effectiveSceneDurationMs(source);
    const shouldMicroZoom = duration >= settings.microZoomEveryMs;
    let appliedMicroZoom = false;
    const elements = source.elements.map((el) => {
      if (appliedMicroZoom || !shouldMicroZoom || (el.type !== "video" && el.type !== "image") || (el.keyframes?.length ?? 0) > 0) return el;
      appliedMicroZoom = true;
      const clipDuration = Math.max(300, Math.min(el.durationMs ?? duration, duration));
      return { ...el, keyframes: [
        { id: makeId("retention_kf"), timeMs: 0, easing: "easeInOut", values: { scale: 1 } },
        { id: makeId("retention_kf"), timeMs: Math.round(clipDuration * .55), easing: "easeInOut", values: { scale: preset === "fast-viral" ? 1.065 : 1.04 } },
        { id: makeId("retention_kf"), timeMs: clipDuration, easing: "easeInOut", values: { scale: 1 } },
      ] };
    });
    const scene: EditorScene = {
      ...source,
      elements,
      durationMs: role === "cta" ? Math.max(source.durationMs, settings.ctaLeadMs) : source.durationMs,
      role,
      transitionIn: transitionFor(preset, index),
      cameraMove: source.cameraMove && source.cameraMove !== "none" ? source.cameraMove : (shouldMicroZoom && !appliedMicroZoom ? "zoomIn" : source.cameraMove),
      retention: { ...source.retention, microZoom: shouldMicroZoom, captionEmphasis: role === "hook" || role === "payoff" || role === "cta", patternInterrupt: false },
    };
    // Use the post-preset duration. CTA minimum-duration adjustments must move
    // every later absolute timestamp, otherwise effect/caption timing can drift.
    const appliedDuration = effectiveSceneDurationMs(scene);
    const absoluteEnd = cursor + appliedDuration;
    if (index > 0 && absoluteEnd >= settings.patternInterruptEveryMs && absoluteEnd % settings.patternInterruptEveryMs < appliedDuration) {
      const kind = preset === "fast-viral" ? (index % 2 ? "flash" : "glitch") : "light-leak";
      effects.push({ id: `retention_${makeId("fx")}`, name: "Retention interrupt", kind, startMs: Math.max(cursor, absoluteEnd - Math.min(450, appliedDuration / 4)), durationMs: Math.min(450, appliedDuration / 4), intensity: preset === "minimal" ? .18 : preset === "fast-viral" ? .65 : .35, opacity: .7 });
      scene.retention = { ...scene.retention, patternInterrupt: true };
    }
    cursor = absoluteEnd;
    return scene;
  });
  const captionClips = (doc.captionClips ?? []).map((clip) => {
    const activeScene = scenes.find((scene, i) => { const start = scenes.slice(0, i).reduce((n,s)=>n+effectiveSceneDurationMs(s),0); return clip.startMs >= start && clip.startMs < start + effectiveSceneDurationMs(scene); });
    const role = activeScene?.role;
    const emphasize = role === "hook" || role === "payoff" || role === "cta" || settings.captionEmphasis === "high";
    return emphasize ? { ...clip, style: { ...clip.style, animation: preset === "educational" ? "karaoke" : "pop", activeColor: preset === "minimal" ? clip.style.activeColor : "#FFD43B" } } : clip;
  });
  return { ...doc, retention: { ...settings }, scenes, captionClips, effectClips: effects };
}
