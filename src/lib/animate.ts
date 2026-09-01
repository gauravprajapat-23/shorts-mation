import type { AnimationSpec, EaseName, EditorDocument, EditorElement, EditorScene, TextElement } from "@/lib/types";
import { renderText } from "@/lib/editor-defaults";
import { resolveElementVariables } from "@/lib/brand-components";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { computeRevealDurationMs, effectiveSceneDurationMs } from "@/lib/timeline-duration";
import { evaluateKeyframes } from "@/lib/keyframes";
export { calculateSlideDuration, computeMinSceneDurationMs, computeRevealDurationMs, effectiveSceneDurationMs } from "@/lib/timeline-duration";
export type { SlideType } from "@/lib/timeline-duration";

/** Substitute {{variables}} into every text element so all timing math (reveal
 *  length, minimum scene duration) is based on the FINAL text, not the raw
 *  template placeholder. Without this a `{{question}}` placeholder counts as one
 *  word and the slide cuts after the first real word appears. */
export function resolveSceneVars(scene: EditorScene, vars: Record<string, string>): EditorScene {
  return {
    ...scene,
    elements: scene.elements.map((el) => resolveElementVariables(el, vars)),
  };
}

export function resolveDocVars(doc: EditorDocument, vars: Record<string, string>): EditorDocument {
  return materializeAutomationDocument(doc, vars).document;
}

export function ease(tRaw: number, name: EaseName = "easeOut"): number {
  const t = Math.min(1, Math.max(0, tRaw));
  switch (name) {
    case "linear": return t;
    case "easeIn": return t * t * t;
    case "bounce": {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1/d1) return n1*t*t;
      if (t < 2/d1) { const x=t-1.5/d1; return n1*x*x+.75; }
      if (t < 2.5/d1) { const x=t-2.25/d1; return n1*x*x+.9375; }
      const x=t-2.625/d1; return n1*x*x+.984375;
    }
    case "easeInOut": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "spring": {
      // Damped spring that overshoots slightly, then settles.
      const s = 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 3);
      return Math.max(0, Math.min(1.08, s));
    }
    case "easeOut":
    default: return 1 - Math.pow(1 - t, 3);
  }
}

export type ElementFrame = {
  x: number; y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  blurPx: number;
  cropX: number; cropY: number; cropScale: number;
  visibleChars?: number;
  visibleWords?: number;
};

export function computeElementFrame(el: EditorElement, tMs: number, sceneDurationMs: number): ElementFrame {
  const anim: AnimationSpec = el.animations ?? {};
  let x = el.x, y = el.y, scale = 1, rotation = el.rotation, opacity = el.opacity;
  let visible = true;
  let blurPx = 0;

  // ── IN ─────────────────────────────────────────────
  const inSpec = anim.in;
  if (inSpec && inSpec.type !== "none") {
    const delay = inSpec.delayMs ?? 0;
    const dur = inSpec.durationMs ?? 600;
    if (tMs < delay) {
      visible = false;
    } else if (tMs < delay + dur) {
      const p = ease((tMs - delay) / dur, inSpec.easing ?? "easeOut");
      const amt = inSpec.amount ?? 1;
      const off = 240 * amt;
      switch (inSpec.type) {
        case "fade": opacity *= p; break;
        case "slideUp": opacity *= p; y += off * (1 - p); break;
        case "slideDown": opacity *= p; y -= off * (1 - p); break;
        case "slideLeft": opacity *= p; x += off * (1 - p); break;
        case "slideRight": opacity *= p; x -= off * (1 - p); break;
        case "scale": opacity *= p; scale *= 0.4 + 0.6 * p; break;
        case "pop": opacity *= Math.min(1, p * 2); scale *= p; break;
        case "blur": opacity *= p; blurPx = 20 * (1 - p); break;
      }
    }
  }

  // ── OUT ────────────────────────────────────────────
  const outSpec = anim.out;
  if (outSpec && outSpec.type !== "none") {
    const dur = outSpec.durationMs ?? 400;
    const start = outSpec.startMs ?? Math.max(0, sceneDurationMs - dur);
    if (tMs >= start) {
      const p = ease((tMs - start) / dur, outSpec.easing ?? "easeOut");
      const amt = outSpec.amount ?? 1;
      const off = 240 * amt;
      switch (outSpec.type) {
        case "fade": opacity *= 1 - p; break;
        case "slideUp": opacity *= 1 - p; y -= off * p; break;
        case "slideDown": opacity *= 1 - p; y += off * p; break;
        case "slideLeft": opacity *= 1 - p; x -= off * p; break;
        case "slideRight": opacity *= 1 - p; x += off * p; break;
        case "scale": opacity *= 1 - p; scale *= 1 - 0.5 * p; break;
        case "pop": opacity *= 1 - p; scale *= 1 + 0.3 * p; break;
        case "blur": opacity *= 1 - p; blurPx = Math.max(blurPx, 20 * p); break;
      }
      if (tMs >= start + dur) visible = false;
    }
  }

  // ── LOOP ───────────────────────────────────────────
  const loop = anim.loop;
  if (loop && loop.type !== "none") {
    const speed = loop.speedMs ?? 2000;
    const amp = loop.amplitude ?? 1;
    const phase = (tMs / speed) * Math.PI * 2;
    switch (loop.type) {
      case "float": y += Math.sin(phase) * 12 * amp; break;
      case "pulse": scale *= 1 + Math.sin(phase) * 0.06 * amp; break;
      case "shake": x += Math.sin(phase * 6) * 5 * amp; break;
      case "kenburns": scale *= 1 + 0.06 * (0.5 + 0.5 * Math.sin(phase * 0.5)) * amp; break;
    }
  }

  // ── Text reveal ────────────────────────────────────
  let visibleChars: number | undefined;
  let visibleWords: number | undefined;
  if (el.type === "text") {
    const t = el as TextElement;
    const reveal = t.reveal ?? "none";
    if (reveal !== "none") {
      const startAfterIn = (anim.in?.delayMs ?? 0) + (anim.in?.durationMs ?? 0);
      const revealDur = Math.max(1, computeRevealDurationMs(el));
      // Linear cadence so words/chars appear at a steady, readable pace.
      const p = Math.min(1, Math.max(0, (tMs - startAfterIn) / revealDur));
      if (reveal === "typewriter" || reveal === "charStagger") {
        visibleChars = Math.min(t.text.length, Math.ceil(t.text.length * p));
      } else if (reveal === "wordByWord") {
        const words = t.text.split(/\s+/).filter(Boolean).length;
        visibleWords = Math.min(words, Math.ceil(words * p));
      }
    }
  }

  const keyed = evaluateKeyframes(el, tMs);
  if (keyed.x !== undefined) x = keyed.x;
  if (keyed.y !== undefined) y = keyed.y;
  if (keyed.scale !== undefined) scale *= keyed.scale;
  if (keyed.rotation !== undefined) rotation = keyed.rotation;
  if (keyed.opacity !== undefined) opacity *= keyed.opacity;
  if (keyed.blur !== undefined) blurPx = Math.max(blurPx, keyed.blur);
  const cropX = keyed.cropX ?? 0, cropY = keyed.cropY ?? 0, cropScale = keyed.cropScale ?? 1;
  return { x, y, scale, rotation, opacity, visible, blurPx, cropX, cropY, cropScale, visibleChars, visibleWords };
}

export function computeCamera(scene: EditorScene, tMs: number): { scale: number; tx: number; ty: number } {
  const move = scene.cameraMove ?? "none";
  const p = Math.min(1, tMs / Math.max(1, effectiveSceneDurationMs(scene)));
  switch (move) {
    case "zoomIn":   return { scale: 1 + 0.08 * p, tx: 0, ty: 0 };
    case "zoomOut":  return { scale: 1.08 - 0.08 * p, tx: 0, ty: 0 };
    case "panLeft":  return { scale: 1.06, tx: -80 * p, ty: 0 };
    case "panRight": return { scale: 1.06, tx: 80 * p, ty: 0 };
    default:         return { scale: 1, tx: 0, ty: 0 };
  }
}

export function sceneTransitionOverlayOpacity(scene: EditorScene, tMs: number): number {
  // Returns opacity of a black overlay used to fade in the scene.
  const kind = scene.transitionIn ?? "cut";
  if (kind === "cut") return 0;
  const dur = 350;
  if (tMs >= dur) return 0;
  const p = ease(tMs / dur, "easeOut");
  return kind === "fade" ? 1 - p : 0;
}

export function totalDocDurationMs(scenes: EditorScene[]): number {
  return scenes.reduce((sum, s) => sum + effectiveSceneDurationMs(s), 0);
}

export function localSceneTime(scenes: EditorScene[], tMs: number): { sceneIndex: number; localMs: number } {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = effectiveSceneDurationMs(s);
    if (tMs < acc + dur) return { sceneIndex: i, localMs: tMs - acc };
    acc += dur;
  }
  const last = scenes[scenes.length - 1];
  return { sceneIndex: scenes.length - 1, localMs: effectiveSceneDurationMs(last) };
}
