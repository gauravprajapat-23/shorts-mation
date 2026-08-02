import type { AnimationSpec, EaseName, EditorDocument, EditorElement, EditorScene, TextElement } from "@/lib/types";
import { renderText } from "@/lib/editor-defaults";

/** Substitute {{variables}} into every text element so all timing math (reveal
 *  length, minimum scene duration) is based on the FINAL text, not the raw
 *  template placeholder. Without this a `{{question}}` placeholder counts as one
 *  word and the slide cuts after the first real word appears. */
export function resolveSceneVars(scene: EditorScene, vars: Record<string, string>): EditorScene {
  return {
    ...scene,
    elements: scene.elements.map((el) =>
      el.type === "text" ? { ...el, text: renderText((el as TextElement).text, vars) } : el,
    ),
  };
}

export function resolveDocVars(doc: EditorDocument, vars: Record<string, string>): EditorDocument {
  if (!vars || Object.keys(vars).length === 0) return doc;
  return { ...doc, scenes: doc.scenes.map((s) => resolveSceneVars(s, vars)) };
}

export function ease(tRaw: number, name: EaseName = "easeOut"): number {
  const t = Math.min(1, Math.max(0, tRaw));
  switch (name) {
    case "linear": return t;
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
  visibleChars?: number;
  visibleWords?: number;
};

// ── Reveal cadence ─────────────────────────────────
// Deterministic per-token pacing so the reveal length depends on the actual
// text — not on the scene duration. This is what prevents "only the first
// word shows before the slide cuts to the next one".
const REVEAL_MS_PER_WORD = 180;   // ~330 wpm reading pace with breathing room
const REVEAL_MS_PER_CHAR = 45;    // typewriter cadence
const REVEAL_MIN_MS = 700;
const READABLE_PAUSE_MS = 900;    // dwell after the last word appears
const TRANSITION_PAD_MS = 350;    // matches sceneTransitionOverlayOpacity()

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeRevealDurationMs(el: EditorElement): number {
  if (el.type !== "text") return 0;
  const t = el as TextElement;
  const reveal = t.reveal ?? "none";
  if (reveal === "none") return 0;
  if (reveal === "wordByWord") {
    return Math.max(REVEAL_MIN_MS, wordCount(t.text) * REVEAL_MS_PER_WORD);
  }
  return Math.max(REVEAL_MIN_MS, t.text.length * REVEAL_MS_PER_CHAR);
}

function elementEndTimeMs(el: EditorElement): number {
  const anim: AnimationSpec = el.animations ?? {};
  const inDelay = anim.in?.delayMs ?? 0;
  const inDur = anim.in?.type && anim.in.type !== "none" ? (anim.in.durationMs ?? 600) : 0;
  const revealDur = computeRevealDurationMs(el);
  const outDur = anim.out?.type && anim.out.type !== "none" ? (anim.out.durationMs ?? 400) : 0;
  return inDelay + inDur + revealDur + READABLE_PAUSE_MS + outDur;
}

/** Minimum scene length so every element finishes its entrance, reveal,
 *  readable pause, and exit before the scene cuts. */
export function computeMinSceneDurationMs(scene: EditorScene): number {
  let min = TRANSITION_PAD_MS;
  for (const el of scene.elements) {
    min = Math.max(min, elementEndTimeMs(el));
  }
  return Math.ceil(min);
}

/** Recommended baseline duration for a slide, from its text + role. */
export type SlideType = "intro" | "question" | "answer" | "cta" | "generic";
export function calculateSlideDuration(text: string, type: SlideType = "generic"): number {
  const words = wordCount(text);
  const readMs = words * REVEAL_MS_PER_WORD + READABLE_PAUSE_MS + TRANSITION_PAD_MS;
  const floor: Record<SlideType, number> = {
    intro: 2500, question: 4000, answer: 3000, cta: 3000, generic: 2500,
  };
  const ceiling: Record<SlideType, number> = {
    intro: 5000, question: 6500, answer: 5500, cta: 4500, generic: 6000,
  };
  return Math.min(ceiling[type], Math.max(floor[type], readMs));
}

/** Scene duration actually used by preview + render. Never shorter than the
 *  author's value, and never shorter than the animation timeline needs. */
export function effectiveSceneDurationMs(scene: EditorScene): number {
  return Math.max(scene.durationMs, computeMinSceneDurationMs(scene));
}

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

  return { x, y, scale, rotation, opacity, visible, blurPx, visibleChars, visibleWords };
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
