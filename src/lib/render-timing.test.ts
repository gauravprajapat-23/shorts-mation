import { describe, expect, it } from "vitest";
import {
  calculateSlideDuration,
  computeElementFrame,
  effectiveSceneDurationMs,
  localSceneTime,
  resolveDocVars,
  totalDocDurationMs,
} from "@/lib/animate";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import type { EditorDocument, EditorScene, TextElement } from "@/lib/types";

const FPS = 20;
const FRAME_MS = 1000 / FPS;

function textEl(text: string, reveal: TextElement["reveal"], id = "t1"): TextElement {
  return {
    id,
    type: "text",
    x: 80,
    y: 700,
    w: 920,
    h: 500,
    rotation: 0,
    opacity: 1,
    locked: false,
    text,
    fontSize: 84,
    fontWeight: 800,
    fontFamily: "Inter",
    color: "#FFFFFF",
    align: "center",
    reveal,
    animations: { in: { type: "fade", delayMs: 300, durationMs: 400 } },
  } as TextElement;
}

function scene(id: string, durationMs: number, els: TextElement[]): EditorScene {
  return { id, name: id, durationMs, background: "#0B0F1A", elements: els };
}

function quizDoc(question: string, answer: string): EditorDocument {
  return {
    version: 1,
    aspect: "9:16",
    scenes: [
      scene("intro", 1000, [textEl("Quiz time", "wordByWord", "intro-t")]),
      // Deliberately far too short + placeholder text: the engine must extend it.
      scene("question", 1200, [textEl("{{question}}", "wordByWord", "q-t")]),
      scene("answer", 1200, [textEl("{{answer}}", "typewriter", "a-t")]),
      scene("cta", 800, [textEl("Follow for more", "wordByWord", "cta-t")]),
    ],
    audio: { volume: 0.7 },
    variables: ["question", "answer"],
  };
}

/** Renders the whole doc frame-by-frame and returns, per scene, the last frame
 *  index at which new text appeared and the frame index of the scene cut. */
function scanTimeline(doc: EditorDocument, vars: Record<string, string>) {
  const resolved = resolveDocVars(doc, vars);
  const totalMs = totalDocDurationMs(resolved.scenes);
  const frames = Math.ceil(totalMs / FRAME_MS);
  const perScene = resolved.scenes.map(() => ({
    lastRevealFrame: -1,
    lastFrame: -1,
    fullyRevealedAtLastFrame: false,
  }));

  for (let f = 0; f < frames; f++) {
    const tMs = f * FRAME_MS;
    const { sceneIndex, localMs } = localSceneTime(resolved.scenes, tMs);
    const s = resolved.scenes[sceneIndex];
    const dur = effectiveSceneDurationMs(s);
    const bucket = perScene[sceneIndex];
    bucket.lastFrame = f;

    let allComplete = true;
    for (const el of s.elements) {
      const frame = computeElementFrame(el, localMs, dur);
      const t = el as TextElement;
      if (frame.visibleWords !== undefined) {
        const total = t.text.trim().split(/\s+/).filter(Boolean).length;
        if (frame.visibleWords < total) allComplete = false;
      } else if (frame.visibleChars !== undefined) {
        if (frame.visibleChars < t.text.length) allComplete = false;
      }
    }
    if (!allComplete) bucket.lastRevealFrame = f;
    bucket.fullyRevealedAtLastFrame = allComplete;
  }
  return { resolved, perScene, totalMs };
}

describe("slide duration vs. text reveal", () => {
  const cases: Array<{ name: string; question: string; answer: string }> = [
    {
      name: "sample coffee quiz",
      question: "Which coffee is best?",
      answer: "The best coffee depends on your taste.",
    },
    { name: "very short", question: "Why?", answer: "Because." },
    {
      name: "very long",
      question:
        "Which of these five brewing methods produces the sweetest and most balanced cup of specialty coffee for beginners at home?",
      answer:
        "A well dialled in pour over usually wins because it highlights sweetness, clarity and acidity without any bitterness at all.",
    },
  ];

  for (const c of cases) {
    it(`keeps every slide on screen until its reveal finishes — ${c.name}`, () => {
      const vars = { question: c.question, answer: c.answer };
      const { resolved, perScene } = scanTimeline(quizDoc(c.question, c.answer), vars);

      resolved.scenes.forEach((s, i) => {
        const b = perScene[i];
        // The slide must not cut before the last reveal frame.
        expect(b.lastRevealFrame).toBeLessThan(b.lastFrame);
        // At the final frame of the slide, all text is fully visible.
        expect(b.fullyRevealedAtLastFrame).toBe(true);
        // And there is a readable pause (>= 700ms) after the reveal completes.
        const pauseMs = (b.lastFrame - b.lastRevealFrame) * FRAME_MS;
        expect(pauseMs).toBeGreaterThanOrEqual(700);
        // Authored duration is never shortened.
        expect(effectiveSceneDurationMs(s)).toBeGreaterThanOrEqual(s.durationMs);
      });
    });

    it(`does not skip or truncate words in the rendered SVG — ${c.name}`, () => {
      const vars = { question: c.question, answer: c.answer };
      const doc = quizDoc(c.question, c.answer);
      const resolved = resolveDocVars(doc, vars);
      // last frame of the question scene
      const questionEnd =
        effectiveSceneDurationMs(resolved.scenes[0]) +
        effectiveSceneDurationMs(resolved.scenes[1]) -
        FRAME_MS;
      const svg = buildSceneSvgAtTime({ doc, tMs: questionEnd, vars, includeBackground: true });
      for (const word of c.question.split(/\s+/)) {
        const plain = word.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
        expect(svg).toContain(plain);
      }
    });
  }

  it("extends a placeholder slide based on the substituted text length", () => {
    const short = quizDoc("Why?", "Because.");
    const long = quizDoc(
      "Which of these five brewing methods produces the sweetest cup of coffee?",
      "A well dialled in pour over usually wins for clarity and sweetness.",
    );
    const shortMs = totalDocDurationMs(resolveDocVars(short, { question: "Why?", answer: "Because." }).scenes);
    const longMs = totalDocDurationMs(
      resolveDocVars(long, {
        question: "Which of these five brewing methods produces the sweetest cup of coffee?",
        answer: "A well dialled in pour over usually wins for clarity and sweetness.",
      }).scenes,
    );
    expect(longMs).toBeGreaterThan(shortMs);
  });

  it("calculateSlideDuration respects the documented floors", () => {
    expect(calculateSlideDuration("Hi", "intro")).toBeGreaterThanOrEqual(2500);
    expect(calculateSlideDuration("Which coffee is best?", "question")).toBeGreaterThanOrEqual(4000);
    expect(calculateSlideDuration("The best coffee depends on your taste.", "answer")).toBeGreaterThanOrEqual(3000);
    expect(calculateSlideDuration("Follow", "cta")).toBeGreaterThanOrEqual(3000);
  });
});