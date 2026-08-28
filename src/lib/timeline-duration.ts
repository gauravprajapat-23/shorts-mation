import type { AnimationSpec, EditorElement, EditorScene, TextElement } from "@/lib/types";

export const REVEAL_MS_PER_WORD = 180;
export const REVEAL_MS_PER_CHAR = 45;
export const REVEAL_MIN_MS = 700;
export const READABLE_PAUSE_MS = 900;
export const TRANSITION_PAD_MS = 350;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeRevealDurationMs(el: EditorElement): number {
  if (el.type !== "text") return 0;
  const t = el as TextElement;
  const reveal = t.reveal ?? "none";
  if (reveal === "none") return 0;
  if (reveal === "wordByWord") return Math.max(REVEAL_MIN_MS, wordCount(t.text) * REVEAL_MS_PER_WORD);
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

export function computeMinSceneDurationMs(scene: EditorScene): number {
  let min = TRANSITION_PAD_MS;
  for (const el of scene.elements) min = Math.max(min, elementEndTimeMs(el));
  return Math.ceil(min);
}

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

export function effectiveSceneDurationMs(scene: EditorScene): number {
  return Math.max(scene.durationMs, computeMinSceneDurationMs(scene));
}
