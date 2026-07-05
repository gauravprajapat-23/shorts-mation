import type { EditorDocument, EditorScene } from "@/lib/types";

// 9:16 canvas is 1080×1920.

const QUIZ: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["category", "question", "optionA", "optionB", "optionC", "optionD", "correct", "cta"],
  scenes: [
    {
      id: "quiz-1", name: "Question", durationMs: 4000, background: "#0B0F1A",
      cameraMove: "zoomIn", transitionIn: "fade",
      elements: [
        { id: "q-bg", type: "shape", shape: "ellipse", x: -200, y: -300, w: 900, h: 900, rotation: 0, opacity: 0.25, fill: "#7C3AED",
          animations: { in: { type: "fade", durationMs: 500 }, loop: { type: "float", amplitude: 1, speedMs: 4000 } } },
        { id: "q-cat", type: "text", text: "{{category}}", x: 240, y: 200, w: 600, h: 90, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 48, fontWeight: 800, color: "#FBBF24", align: "center",
          background: "rgba(251,191,36,0.15)",
          animations: { in: { type: "pop", durationMs: 500, easing: "spring" } } },
        { id: "q-title", type: "text", text: "{{question}}", x: 80, y: 560, w: 920, h: 500, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 92, fontWeight: 900, color: "#FFFFFF", align: "center",
          reveal: "wordByWord",
          animations: { in: { type: "fade", delayMs: 300, durationMs: 400 } } },
        { id: "q-timer", type: "text", text: "3 · 2 · 1", x: 240, y: 1500, w: 600, h: 120, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 72, fontWeight: 900, color: "#FBBF24", align: "center",
          animations: { in: { type: "slideUp", delayMs: 1200, durationMs: 500 }, loop: { type: "pulse", amplitude: 1, speedMs: 800 } } },
      ],
    },
    {
      id: "quiz-2", name: "Options", durationMs: 4500, background: "#0B0F1A",
      transitionIn: "fade",
      elements: [
        { id: "o-a", type: "text", text: "A. {{optionA}}", x: 80, y: 320, w: 920, h: 160, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#FFFFFF", align: "left",
          background: "rgba(255,255,255,0.08)",
          animations: { in: { type: "slideRight", delayMs: 0, durationMs: 400, easing: "spring" } } },
        { id: "o-b", type: "text", text: "B. {{optionB}}", x: 80, y: 540, w: 920, h: 160, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#FFFFFF", align: "left",
          background: "rgba(255,255,255,0.08)",
          animations: { in: { type: "slideRight", delayMs: 150, durationMs: 400, easing: "spring" } } },
        { id: "o-c", type: "text", text: "C. {{optionC}}", x: 80, y: 760, w: 920, h: 160, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#FFFFFF", align: "left",
          background: "rgba(255,255,255,0.08)",
          animations: { in: { type: "slideRight", delayMs: 300, durationMs: 400, easing: "spring" } } },
        { id: "o-d", type: "text", text: "D. {{optionD}}", x: 80, y: 980, w: 920, h: 160, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#FFFFFF", align: "left",
          background: "rgba(255,255,255,0.08)",
          animations: { in: { type: "slideRight", delayMs: 450, durationMs: 400, easing: "spring" } } },
        { id: "o-answer-bg", type: "shape", shape: "rect", x: 80, y: 1280, w: 920, h: 220, rotation: 0, opacity: 1, fill: "#10B981", radius: 24,
          animations: { in: { type: "pop", delayMs: 2500, durationMs: 500, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1200 } } },
        { id: "o-answer", type: "text", text: "✓ {{correct}}", x: 80, y: 1280, w: 920, h: 220, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 72, fontWeight: 900, color: "#0B0F1A", align: "center",
          animations: { in: { type: "fade", delayMs: 2700, durationMs: 300 } } },
      ],
    },
    {
      id: "quiz-3", name: "CTA", durationMs: 3000, background: "#0B0F1A", transitionIn: "fade",
      elements: [
        { id: "cta-text", type: "text", text: "{{cta}}", x: 60, y: 800, w: 960, h: 320, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 110, fontWeight: 900, color: "#FFFFFF", align: "center",
          animations: { in: { type: "scale", durationMs: 500, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1000 } } },
        { id: "cta-sub", type: "text", text: "Follow for more →", x: 60, y: 1200, w: 960, h: 120, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#FBBF24", align: "center",
          animations: { in: { type: "slideUp", delayMs: 400, durationMs: 500 }, loop: { type: "float", amplitude: 1, speedMs: 1500 } } },
      ],
    },
  ],
};

const MOTIVATION: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["quote", "author", "handle"],
  scenes: [
    {
      id: "mot-1", name: "Quote", durationMs: 7000, background: "#0A0A0A",
      cameraMove: "zoomIn", transitionIn: "fade",
      elements: [
        { id: "m-bar", type: "shape", shape: "rect", x: 80, y: 480, w: 12, h: 800, rotation: 0, opacity: 1, fill: "#DC2626", radius: 999,
          animations: { in: { type: "slideDown", durationMs: 500, easing: "easeOut" } } },
        { id: "m-quote", type: "text", text: "{{quote}}", x: 140, y: 480, w: 880, h: 800, rotation: 0, opacity: 1,
          fontFamily: "Georgia", fontSize: 88, fontWeight: 700, color: "#FFFFFF", align: "left",
          reveal: "wordByWord",
          animations: { in: { type: "fade", delayMs: 400, durationMs: 500 } } },
        { id: "m-author", type: "text", text: "— {{author}}", x: 140, y: 1360, w: 880, h: 90, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 44, fontWeight: 700, color: "#DC2626", align: "left",
          animations: { in: { type: "slideRight", delayMs: 3500, durationMs: 600 } } },
      ],
    },
    {
      id: "mot-2", name: "Handle", durationMs: 2500, background: "#DC2626", transitionIn: "fade",
      elements: [
        { id: "h-text", type: "text", text: "{{handle}}", x: 60, y: 850, w: 960, h: 220, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 110, fontWeight: 900, color: "#FFFFFF", align: "center",
          animations: { in: { type: "pop", durationMs: 500, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1000 } } },
      ],
    },
  ],
};

const FACT: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["stat", "unit", "fact", "source"],
  scenes: [
    {
      id: "f-1", name: "Fact", durationMs: 6500, background: "#111827",
      cameraMove: "zoomOut", transitionIn: "fade",
      elements: [
        { id: "kicker", type: "text", text: "DID YOU KNOW?", x: 60, y: 260, w: 960, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 52, fontWeight: 800, color: "#F59E0B", align: "center",
          animations: { in: { type: "slideDown", durationMs: 500, easing: "spring" } } },
        { id: "stat", type: "text", text: "{{stat}}", x: 60, y: 460, w: 960, h: 320, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 260, fontWeight: 900, color: "#FFFFFF", align: "center",
          animations: { in: { type: "pop", delayMs: 300, durationMs: 700, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1500 } } },
        { id: "unit", type: "text", text: "{{unit}}", x: 60, y: 800, w: 960, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 56, fontWeight: 800, color: "#F59E0B", align: "center",
          animations: { in: { type: "fade", delayMs: 900, durationMs: 400 } } },
        { id: "fact", type: "text", text: "{{fact}}", x: 80, y: 1000, w: 920, h: 500, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 60, fontWeight: 700, color: "#E5E7EB", align: "center",
          reveal: "wordByWord",
          animations: { in: { type: "slideUp", delayMs: 1300, durationMs: 500 } } },
        { id: "src", type: "text", text: "Source: {{source}}", x: 80, y: 1720, w: 920, h: 80, rotation: 0, opacity: 1,
          fontFamily: "Inter", fontSize: 32, fontWeight: 600, color: "#6B7280", align: "center",
          animations: { in: { type: "fade", delayMs: 4000, durationMs: 400 } } },
      ],
    },
  ],
};

const TOP5: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["title", "item5", "item4", "item3", "item2", "item1"],
  scenes: [
    { id: "t-title", name: "Title", durationMs: 2500, background: "#020617", transitionIn: "fade",
      elements: [
        { id: "tt", type: "text", text: "{{title}}", x: 60, y: 780, w: 960, h: 360, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 130, fontWeight: 900, color: "#FFFFFF", align: "center",
          animations: { in: { type: "scale", durationMs: 500, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1500 } } },
        { id: "tk", type: "text", text: "TOP 5 · COUNTDOWN", x: 60, y: 620, w: 960, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 44, fontWeight: 800, color: "#F97316", align: "center",
          animations: { in: { type: "slideDown", durationMs: 400 } } },
      ] },
    ...([5, 4, 3, 2, 1].map((rank): EditorScene => ({
      id: `t-${rank}`, name: `#${rank}`, durationMs: rank === 1 ? 3500 : 2000, background: "#020617",
      transitionIn: "fade", cameraMove: rank === 1 ? "zoomIn" : "none",
      elements: [
        { id: `t-${rank}-rank`, type: "text", text: `#${rank}`, x: 60, y: 500, w: 960, h: 320, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 300, fontWeight: 900, color: rank === 1 ? "#F97316" : "#FFFFFF", align: "center",
          animations: { in: { type: "slideLeft", durationMs: 400, easing: "spring" }, loop: rank === 1 ? { type: "pulse", amplitude: 1, speedMs: 800 } : { type: "none" } } },
        { id: `t-${rank}-bar`, type: "shape", shape: "rect", x: 60, y: 900, w: 960, h: 10, rotation: 0, opacity: 1, fill: "#F97316", radius: 999,
          animations: { in: { type: "slideRight", delayMs: 150, durationMs: 400 } } },
        { id: `t-${rank}-text`, type: "text", text: `{{item${rank}}}`, x: 60, y: 970, w: 960, h: 500, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 96, fontWeight: 900, color: "#FFFFFF", align: "center",
          animations: { in: { type: "slideUp", delayMs: 300, durationMs: 500, easing: "spring" } } },
      ],
    }))),
  ],
};

export type StarterTemplate = { name: string; type: string; doc: EditorDocument };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { name: "Quiz — Guess the Answer", type: "quiz",       doc: QUIZ },
  { name: "Motivation — Stoic Punch", type: "motivation", doc: MOTIVATION },
  { name: "Did You Know? — Fact",     type: "fact",       doc: FACT },
  { name: "Top 5 — Countdown",        type: "countdown",  doc: TOP5 },
];
