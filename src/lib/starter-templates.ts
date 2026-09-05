import type { EditorDocument, EditorScene } from "@/lib/types";
import { migrateDocumentV1ToV2, syncV2Timeline } from "@/lib/editor-document-v2";

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


const LETTER_MATCH: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["word", "missingLetter", "optionA", "optionB", "optionC", "objectImage", "clue", "cta"],
  scenes: [
    {
      id: "lm-hook", name: "Hook", durationMs: 1800, background: "#07111F", cameraMove: "zoomIn", transitionIn: "fade",
      elements: [
        { id: "lm-hook-glow", type: "shape", shape: "ellipse", x: 120, y: 340, w: 840, h: 840, rotation: 0, opacity: 0.2, fill: "#38BDF8",
          animations: { in: { type: "scale", durationMs: 500, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1000 } } },
        { id: "lm-hook-kicker", type: "text", text: "LETTER MATCH", x: 150, y: 250, w: 780, h: 90, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 48, fontWeight: 900, color: "#FACC15", align: "center", letterSpacing: 4,
          animations: { in: { type: "slideDown", durationMs: 420, easing: "spring" } } },
        { id: "lm-hook-title", type: "text", text: "CAN YOU COMPLETE\nTHE WORD?", x: 80, y: 590, w: 920, h: 430, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 108, fontWeight: 900, color: "#FFFFFF", align: "center", maxLines: 2, autoFit: true,
          stroke: "#07111F", strokeWidth: 5, shadows: [{ x: 0, y: 16, blur: 18, color: "#000000", opacity: 0.45 }],
          animations: { in: { type: "pop", delayMs: 220, durationMs: 600, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1200 } } },
        { id: "lm-hook-sub", type: "text", text: "Look fast • choose the missing letter", x: 120, y: 1160, w: 840, h: 130, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 42, fontWeight: 700, color: "#BAE6FD", align: "center",
          animations: { in: { type: "slideUp", delayMs: 650, durationMs: 450 } } },
      ],
    },
    {
      id: "lm-challenge", name: "Match the Letter", durationMs: 5200, background: "#07111F", transitionIn: "zoom",
      elements: [
        { id: "lm-top-pill", type: "shape", shape: "rect", x: 245, y: 105, w: 590, h: 86, rotation: 0, opacity: 1, fill: "#0F2740", radius: 999,
          animations: { in: { type: "slideDown", durationMs: 350 } } },
        { id: "lm-top-label", type: "text", text: "FIND THE MISSING LETTER", x: 245, y: 105, w: 590, h: 86, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 34, fontWeight: 900, color: "#7DD3FC", align: "center", letterSpacing: 2,
          animations: { in: { type: "fade", delayMs: 140, durationMs: 280 } } },
        { id: "lm-image-card", type: "shape", shape: "rect", x: 190, y: 260, w: 700, h: 610, rotation: 0, opacity: 1, fill: "#FFFFFF", radius: 56,
          stroke: "#38BDF8", strokeWidth: 10,
          animations: { in: { type: "pop", delayMs: 120, durationMs: 600, easing: "spring" }, loop: { type: "float", amplitude: 1, speedMs: 1800 } } },
        { id: "lm-object-image", type: "image", src: "{{objectImage}}", x: 235, y: 305, w: 610, h: 520, rotation: 0, opacity: 1, fit: "contain",
          animations: { in: { type: "scale", delayMs: 250, durationMs: 600, easing: "spring" } } },
        { id: "lm-clue", type: "text", text: "{{clue}}", x: 160, y: 900, w: 760, h: 90, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 34, fontWeight: 700, color: "#94A3B8", align: "center", autoFit: true,
          animations: { in: { type: "fade", delayMs: 500, durationMs: 350 } } },
        { id: "lm-word-card", type: "shape", shape: "rect", x: 120, y: 1030, w: 840, h: 250, rotation: 0, opacity: 1, fill: "#0F2740", radius: 36,
          stroke: "#1E3A5F", strokeWidth: 4,
          animations: { in: { type: "slideUp", delayMs: 500, durationMs: 500, easing: "spring" } } },
        { id: "lm-word", type: "text", text: "{{word}}", x: 150, y: 1050, w: 780, h: 210, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 122, fontWeight: 900, color: "#FFFFFF", align: "center", letterSpacing: 12, textTransform: "uppercase", autoFit: true, maxLines: 1,
          stroke: "#07111F", strokeWidth: 3,
          animations: { in: { type: "pop", delayMs: 680, durationMs: 520, easing: "spring" } } },

        { id: "lm-option-a-bg", type: "shape", shape: "rect", x: 105, y: 1380, w: 250, h: 250, rotation: -3, opacity: 1, fill: "#F8FAFC", radius: 42,
          stroke: "#CBD5E1", strokeWidth: 5, animations: { in: { type: "slideRight", delayMs: 900, durationMs: 480, easing: "spring" }, loop: { type: "float", amplitude: 1, speedMs: 1450 } } },
        { id: "lm-option-a", type: "text", text: "{{optionA}}", x: 105, y: 1380, w: 250, h: 250, rotation: -3, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 132, fontWeight: 900, color: "#0F172A", align: "center", textTransform: "uppercase",
          animations: { in: { type: "pop", delayMs: 1050, durationMs: 350, easing: "spring" } } },

        { id: "lm-option-b-bg", type: "shape", shape: "rect", x: 415, y: 1380, w: 250, h: 250, rotation: 2, opacity: 1, fill: "#F8FAFC", radius: 42,
          stroke: "#CBD5E1", strokeWidth: 5, animations: { in: { type: "slideUp", delayMs: 1050, durationMs: 480, easing: "spring" }, loop: { type: "float", amplitude: 1, speedMs: 1600 } } },
        { id: "lm-option-b", type: "text", text: "{{optionB}}", x: 415, y: 1380, w: 250, h: 250, rotation: 2, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 132, fontWeight: 900, color: "#0F172A", align: "center", textTransform: "uppercase",
          animations: { in: { type: "pop", delayMs: 1200, durationMs: 350, easing: "spring" } } },

        { id: "lm-option-c-bg", type: "shape", shape: "rect", x: 725, y: 1380, w: 250, h: 250, rotation: -2, opacity: 1, fill: "#F8FAFC", radius: 42,
          stroke: "#CBD5E1", strokeWidth: 5, animations: { in: { type: "slideLeft", delayMs: 1200, durationMs: 480, easing: "spring" }, loop: { type: "float", amplitude: 1, speedMs: 1500 } } },
        { id: "lm-option-c", type: "text", text: "{{optionC}}", x: 725, y: 1380, w: 250, h: 250, rotation: -2, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 132, fontWeight: 900, color: "#0F172A", align: "center", textTransform: "uppercase",
          animations: { in: { type: "pop", delayMs: 1350, durationMs: 350, easing: "spring" } } },

        { id: "lm-think", type: "text", text: "3   •   2   •   1", x: 240, y: 1710, w: 600, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 58, fontWeight: 900, color: "#FACC15", align: "center",
          animations: { in: { type: "fade", delayMs: 1700, durationMs: 350 }, loop: { type: "pulse", amplitude: 1, speedMs: 780 } } },
      ],
    },
    {
      id: "lm-reveal", name: "Correct Match", durationMs: 2600, background: "#052E2B", transitionIn: "flash", cameraMove: "zoomIn",
      elements: [
        { id: "lm-reveal-burst", type: "shape", shape: "ellipse", x: 90, y: 250, w: 900, h: 900, rotation: 0, opacity: 0.18, fill: "#34D399",
          animations: { in: { type: "scale", durationMs: 420, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 900 } } },
        { id: "lm-correct", type: "text", text: "✓ CORRECT!", x: 120, y: 270, w: 840, h: 150, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 82, fontWeight: 900, color: "#6EE7B7", align: "center",
          animations: { in: { type: "pop", durationMs: 500, easing: "spring" } } },
        { id: "lm-answer-letter-bg", type: "shape", shape: "rect", x: 340, y: 540, w: 400, h: 400, rotation: 0, opacity: 1, fill: "#FFFFFF", radius: 72,
          stroke: "#34D399", strokeWidth: 14,
          animations: { in: { type: "scale", delayMs: 180, durationMs: 620, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1000 } } },
        { id: "lm-answer-letter", type: "text", text: "{{missingLetter}}", x: 340, y: 540, w: 400, h: 400, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 240, fontWeight: 900, color: "#064E3B", align: "center", textTransform: "uppercase",
          animations: { in: { type: "pop", delayMs: 380, durationMs: 480, easing: "spring" } } },
        { id: "lm-answer-word", type: "text", text: "{{word}}", x: 80, y: 1060, w: 920, h: 250, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 138, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", letterSpacing: 10, autoFit: true, maxLines: 1,
          stroke: "#022C22", strokeWidth: 5,
          animations: { in: { type: "slideUp", delayMs: 550, durationMs: 500, easing: "spring" } } },
        { id: "lm-answer-sub", type: "text", text: "You matched it!", x: 140, y: 1370, w: 800, h: 110, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 52, fontWeight: 800, color: "#A7F3D0", align: "center",
          animations: { in: { type: "fade", delayMs: 900, durationMs: 350 } } },
      ],
    },
    {
      id: "lm-cta", name: "Next Challenge", durationMs: 2200, background: "#111827", transitionIn: "whip",
      elements: [
        { id: "lm-cta-small", type: "text", text: "HOW MANY DID YOU GET RIGHT?", x: 100, y: 500, w: 880, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 42, fontWeight: 900, color: "#FACC15", align: "center",
          animations: { in: { type: "slideDown", durationMs: 400 } } },
        { id: "lm-cta-main", type: "text", text: "{{cta}}", x: 80, y: 700, w: 920, h: 420, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 104, fontWeight: 900, color: "#FFFFFF", align: "center", autoFit: true, maxLines: 3,
          textGradient: { from: "#FFFFFF", to: "#7DD3FC", angle: 90 },
          animations: { in: { type: "pop", delayMs: 180, durationMs: 600, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 1050 } } },
        { id: "lm-cta-follow", type: "text", text: "FOLLOW • LIKE • PLAY AGAIN", x: 130, y: 1320, w: 820, h: 110, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 42, fontWeight: 800, color: "#93C5FD", align: "center", letterSpacing: 2,
          animations: { in: { type: "slideUp", delayMs: 520, durationMs: 450 } } },
      ],
    },
  ],
};


const HALF_CUT_WORD_MATCH_BASE: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["word", "backgroundImage", "cta"],
  scenes: [
    {
      id: "hlw-game",
      name: "Half-Cut Word Match",
      durationMs: 5000,
      background: "#26D9F2",
      transitionIn: "fade",
      dynamicLayout: {
        type: "halfLetterWord",
        wordVariable: "word",
        maxCharacters: 10,
        correctSfx: "/sounds/letter-match-correct.wav",
        wrongSfx: "/sounds/letter-match-wrong.wav",
      },
      elements: [
        // Default background is intentionally built from editable shapes — no generated image required.
        { id: "hlw-bg-sky", type: "shape", shape: "rect", x: 0, y: 0, w: 1080, h: 1285, rotation: 0, opacity: 1, fill: "#27DDF2",
          visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-bg-horizon", type: "shape", shape: "rect", x: 0, y: 1240, w: 1080, h: 120, rotation: 0, opacity: 1, fill: "#54E88B",
          visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-bg-grass", type: "shape", shape: "rect", x: 0, y: 1300, w: 1080, h: 620, rotation: 0, opacity: 1, fill: "#35E51D",
          visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-custom-background", type: "image", src: "{{backgroundImage}}", x: 0, y: 0, w: 1080, h: 1920, rotation: 0, opacity: 1, fit: "cover",
          visibleWhen: { variable: "backgroundImage", operator: "notEmpty" } },
        { id: "hlw-header", type: "text", text: "MATCH THE CUT LETTERS", x: 90, y: 70, w: 900, h: 100, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 48, fontWeight: 900, color: "#FFFFFF", align: "center", letterSpacing: 2,
          stroke: "#0F172A", strokeWidth: 3, animations: { in: { type: "slideDown", durationMs: 380, easing: "spring" } } },
        { id: "hlw-word-label", type: "text", text: "{{word}}", x: 150, y: 155, w: 780, h: 90, rotation: 0, opacity: 0.88,
          fontFamily: "Plus Jakarta Sans", fontSize: 42, fontWeight: 900, color: "#FACC15", align: "center", textTransform: "uppercase", letterSpacing: 7,
          stroke: "#0F172A", strokeWidth: 2 },
      ],
    },
    {
      id: "hlw-cta",
      name: "Finished Word",
      durationMs: 2100,
      background: "#27DDF2",
      transitionIn: "flash",
      elements: [
        { id: "hlw-cta-bg-sky", type: "shape", shape: "rect", x: 0, y: 0, w: 1080, h: 1285, rotation: 0, opacity: 1, fill: "#27DDF2", visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-cta-bg-horizon", type: "shape", shape: "rect", x: 0, y: 1240, w: 1080, h: 120, rotation: 0, opacity: 1, fill: "#54E88B", visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-cta-bg-grass", type: "shape", shape: "rect", x: 0, y: 1300, w: 1080, h: 620, rotation: 0, opacity: 1, fill: "#35E51D", visibleWhen: { variable: "backgroundImage", operator: "falsy" } },
        { id: "hlw-cta-custom-background", type: "image", src: "{{backgroundImage}}", x: 0, y: 0, w: 1080, h: 1920, rotation: 0, opacity: 1, fit: "cover", visibleWhen: { variable: "backgroundImage", operator: "notEmpty" } },
        { id: "hlw-cta-word", type: "text", text: "{{word}}", x: 90, y: 560, w: 900, h: 260, rotation: 0, opacity: 1,
          fontFamily: "Arial Black", fontSize: 170, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          textGradient: { from: "#FF2F92", to: "#22C55E", angle: 90 }, stroke: "#0F172A", strokeWidth: 4,
          animations: { in: { type: "pop", durationMs: 450, easing: "spring" } } },
        { id: "hlw-cta-text", type: "text", text: "{{cta}}", x: 100, y: 920, w: 880, h: 260, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 72, fontWeight: 900, color: "#FACC15", align: "center", autoFit: true, maxLines: 2,
          animations: { in: { type: "slideUp", delayMs: 250, durationMs: 450, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 950 } } },
      ],
    },
  ],
};

const HALF_CUT_WORD_MATCH = (() => {
  const doc = migrateDocumentV1ToV2(HALF_CUT_WORD_MATCH_BASE);
  doc.automationVariables = [
    { id: "var_word", name: "word", label: "Word", type: "text", required: true, defaultValue: "HOUSE", description: "Enter one word. The template automatically creates and animates every half letter.", validation: { minLength: 2, maxLength: 10, pattern: "^[A-Za-z0-9]+$" } },
    { id: "var_backgroundImage", name: "backgroundImage", label: "Custom background", type: "image", defaultValue: "", description: "Optional image URL or uploaded asset. Leave empty to use the editable sky + grass background." },
    { id: "var_cta", name: "cta", label: "Ending text", type: "text", defaultValue: "How many did you match?" },
  ];
  doc.audioMix = { duckingEnabled: false, duckLevel: 1, attackMs: 0, releaseMs: 0 };
  return syncV2Timeline(doc);
})();


const HALF_LETTER_MATCH_BASE: EditorDocument = {
  version: 1,
  aspect: "9:16",
  variables: ["word", "letter1", "letter2", "letter3", "cta"],
  scenes: [
    {
      id: "hlm-game", name: "Half Letter Match", durationMs: 9300, background: "#07111F",
      transitionIn: "fade",
      elements: [
        { id: "hlm-title", type: "text", text: "MATCH THE HALF LETTERS", x: 90, y: 95, w: 900, h: 120, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 58, fontWeight: 900, color: "#FFFFFF", align: "center", letterSpacing: 2,
          animations: { in: { type: "slideDown", durationMs: 420, easing: "spring" } } },
        { id: "hlm-word", type: "text", text: "{{word}}", x: 180, y: 235, w: 720, h: 130, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 78, fontWeight: 900, color: "#FACC15", align: "center", textTransform: "uppercase", letterSpacing: 10,
          animations: { in: { type: "pop", delayMs: 180, durationMs: 450, easing: "spring" } } },
        { id: "hlm-help", type: "text", text: "Watch each moving half find its match", x: 130, y: 365, w: 820, h: 80, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 34, fontWeight: 700, color: "#94A3B8", align: "center" },

        { id: "hlm-slot-a", type: "shape", shape: "rect", x: 90, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1, fill: "#0F2238", radius: 36, stroke: "#28435F", strokeWidth: 5 },
        { id: "hlm-slot-b", type: "shape", shape: "rect", x: 400, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1, fill: "#0F2238", radius: 36, stroke: "#28435F", strokeWidth: 5 },
        { id: "hlm-slot-c", type: "shape", shape: "rect", x: 710, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1, fill: "#0F2238", radius: 36, stroke: "#28435F", strokeWidth: 5 },
        { id: "hlm-cut-a", type: "shape", shape: "line", x: 229, y: 1020, w: 2, h: 320, rotation: 0, opacity: .45, fill: "#64748B", strokeWidth: 2 },
        { id: "hlm-cut-b", type: "shape", shape: "line", x: 539, y: 1020, w: 2, h: 320, rotation: 0, opacity: .45, fill: "#64748B", strokeWidth: 2 },
        { id: "hlm-cut-c", type: "shape", shape: "line", x: 849, y: 1020, w: 2, h: 320, rotation: 0, opacity: .45, fill: "#64748B", strokeWidth: 2 },

        // Stationary LEFT halves. The same full character is clipped at 50%, so matching is pixel-perfect.
        { id: "hlm-l1-left", type: "text", text: "{{letter1}}", x: 90, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { right: 50 }, stroke: "#0B1220", strokeWidth: 3 },
        { id: "hlm-l2-left", type: "text", text: "{{letter2}}", x: 400, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { right: 50 }, stroke: "#0B1220", strokeWidth: 3 },
        { id: "hlm-l3-left", type: "text", text: "{{letter3}}", x: 710, y: 1000, w: 280, h: 360, rotation: 0, opacity: 1,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { right: 50 }, stroke: "#0B1220", strokeWidth: 3 },

        // Reverse-order moving RIGHT half: letter 3 tries slot 1, slot 2, then correctly lands on slot 3.
        { id: "hlm-l3-right", type: "text", text: "{{letter3}}", x: 710, y: -340, w: 280, h: 360, rotation: 0, opacity: 1, startMs: 0, durationMs: 9300,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#38BDF8", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { left: 50 }, stroke: "#082F49", strokeWidth: 3,
          keyframes: [
            { id: "hlm-t0", timeMs: 0, easing: "linear", values: { x: 90, y: -340 } },
            { id: "hlm-t1", timeMs: 1150, easing: "bounce", values: { x: 90, y: 1000 } },
            { id: "hlm-t2", timeMs: 1650, easing: "easeInOut", values: { x: 400, y: 760 } },
            { id: "hlm-t3", timeMs: 2600, easing: "bounce", values: { x: 400, y: 1000 } },
            { id: "hlm-t4", timeMs: 3150, easing: "easeInOut", values: { x: 710, y: 760 } },
            { id: "hlm-t5", timeMs: 3950, easing: "bounce", values: { x: 710, y: 1000 } },
            { id: "hlm-t6", timeMs: 9300, easing: "linear", values: { x: 710, y: 1000 } }
          ] },

        // Moving RIGHT half: letter 2 tries slot 1, then correctly lands on slot 2.
        { id: "hlm-l2-right", type: "text", text: "{{letter2}}", x: 400, y: -340, w: 280, h: 360, rotation: 0, opacity: 1, startMs: 4300, durationMs: 5000,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#A78BFA", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { left: 50 }, stroke: "#2E1065", strokeWidth: 3,
          keyframes: [
            { id: "hlm-n0", timeMs: 0, easing: "linear", values: { x: 90, y: -340 } },
            { id: "hlm-n1", timeMs: 1000, easing: "bounce", values: { x: 90, y: 1000 } },
            { id: "hlm-n2", timeMs: 1550, easing: "easeInOut", values: { x: 400, y: 760 } },
            { id: "hlm-n3", timeMs: 2250, easing: "bounce", values: { x: 400, y: 1000 } },
            { id: "hlm-n4", timeMs: 5000, easing: "linear", values: { x: 400, y: 1000 } }
          ] },

        // Moving RIGHT half: letter 1 directly completes the final unmatched pair.
        { id: "hlm-l1-right", type: "text", text: "{{letter1}}", x: 90, y: -340, w: 280, h: 360, rotation: 0, opacity: 1, startMs: 6900, durationMs: 2400,
          fontFamily: "Arial Black", fontSize: 250, fontWeight: 900, color: "#34D399", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          clipInsetPct: { left: 50 }, stroke: "#064E3B", strokeWidth: 3,
          keyframes: [
            { id: "hlm-a0", timeMs: 0, easing: "linear", values: { x: 90, y: -340 } },
            { id: "hlm-a1", timeMs: 900, easing: "bounce", values: { x: 90, y: 1000 } },
            { id: "hlm-a2", timeMs: 2400, easing: "linear", values: { x: 90, y: 1000 } }
          ] },

        // Wrong/correct feedback flashes at the exact collision points.
        { id: "hlm-wrong-1", type: "text", text: "✕", x: 150, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 1120, durationMs: 520,
          fontFamily: "Arial", fontSize: 150, fontWeight: 900, color: "#FB7185", align: "center", animations: { in: { type: "pop", durationMs: 180, easing: "spring" }, out: { type: "fade", startMs: 330, durationMs: 180 } } },
        { id: "hlm-wrong-2", type: "text", text: "✕", x: 460, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 2570, durationMs: 520,
          fontFamily: "Arial", fontSize: 150, fontWeight: 900, color: "#FB7185", align: "center", animations: { in: { type: "pop", durationMs: 180, easing: "spring" }, out: { type: "fade", startMs: 330, durationMs: 180 } } },
        { id: "hlm-correct-3", type: "text", text: "✓", x: 770, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 3920, durationMs: 750,
          fontFamily: "Arial", fontSize: 142, fontWeight: 900, color: "#4ADE80", align: "center", animations: { in: { type: "pop", durationMs: 200, easing: "spring" } } },
        { id: "hlm-wrong-3", type: "text", text: "✕", x: 150, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 5270, durationMs: 520,
          fontFamily: "Arial", fontSize: 150, fontWeight: 900, color: "#FB7185", align: "center", animations: { in: { type: "pop", durationMs: 180, easing: "spring" }, out: { type: "fade", startMs: 330, durationMs: 180 } } },
        { id: "hlm-correct-2", type: "text", text: "✓", x: 460, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 6420, durationMs: 760,
          fontFamily: "Arial", fontSize: 142, fontWeight: 900, color: "#4ADE80", align: "center", animations: { in: { type: "pop", durationMs: 200, easing: "spring" } } },
        { id: "hlm-correct-1", type: "text", text: "✓", x: 150, y: 760, w: 160, h: 170, rotation: 0, opacity: 1, startMs: 7750, durationMs: 900,
          fontFamily: "Arial", fontSize: 142, fontWeight: 900, color: "#4ADE80", align: "center", animations: { in: { type: "pop", durationMs: 200, easing: "spring" } } },

        { id: "hlm-complete", type: "text", text: "✓ {{word}} COMPLETE!", x: 110, y: 1490, w: 860, h: 190, rotation: 0, opacity: 1, startMs: 7900, durationMs: 1400,
          fontFamily: "Plus Jakarta Sans", fontSize: 70, fontWeight: 900, color: "#86EFAC", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1,
          animations: { in: { type: "pop", durationMs: 420, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 900 } } },
      ],
    },
    {
      id: "hlm-cta", name: "CTA", durationMs: 1900, background: "#0F172A", transitionIn: "flash",
      elements: [
        { id: "hlm-cta-title", type: "text", text: "{{word}}", x: 120, y: 520, w: 840, h: 260, rotation: 0, opacity: 1,
          fontFamily: "Arial Black", fontSize: 190, fontWeight: 900, color: "#FFFFFF", align: "center", textTransform: "uppercase", letterSpacing: 18,
          animations: { in: { type: "pop", durationMs: 450, easing: "spring" } } },
        { id: "hlm-cta-text", type: "text", text: "{{cta}}", x: 100, y: 920, w: 880, h: 280, rotation: 0, opacity: 1,
          fontFamily: "Plus Jakarta Sans", fontSize: 76, fontWeight: 900, color: "#FACC15", align: "center", autoFit: true, maxLines: 2,
          animations: { in: { type: "slideUp", delayMs: 250, durationMs: 450, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 950 } } },
      ],
    },
  ],
};

const HALF_LETTER_MATCH = (() => {
  const doc = migrateDocumentV1ToV2(HALF_LETTER_MATCH_BASE);
  doc.audioClips = [
    { id: "hlm-sfx-wrong-1", name: "Wrong match", src: "/sounds/letter-match-wrong.wav", role: "sfx", startMs: 1180, durationMs: 210, sourceStartMs: 0, sourceEndMs: 210, volume: .95 },
    { id: "hlm-sfx-wrong-2", name: "Wrong match", src: "/sounds/letter-match-wrong.wav", role: "sfx", startMs: 2630, durationMs: 210, sourceStartMs: 0, sourceEndMs: 210, volume: .95 },
    { id: "hlm-sfx-correct-3", name: "Correct match", src: "/sounds/letter-match-correct.wav", role: "sfx", startMs: 3990, durationMs: 190, sourceStartMs: 0, sourceEndMs: 190, volume: 1 },
    { id: "hlm-sfx-wrong-3", name: "Wrong match", src: "/sounds/letter-match-wrong.wav", role: "sfx", startMs: 5330, durationMs: 210, sourceStartMs: 0, sourceEndMs: 210, volume: .95 },
    { id: "hlm-sfx-correct-2", name: "Correct match", src: "/sounds/letter-match-correct.wav", role: "sfx", startMs: 6480, durationMs: 190, sourceStartMs: 0, sourceEndMs: 190, volume: 1 },
    { id: "hlm-sfx-correct-1", name: "Correct match", src: "/sounds/letter-match-correct.wav", role: "sfx", startMs: 7810, durationMs: 190, sourceStartMs: 0, sourceEndMs: 190, volume: 1 },
  ];
  doc.audioMix = { duckingEnabled: false, duckLevel: 1, attackMs: 0, releaseMs: 0 };
  return syncV2Timeline(doc);
})();


// High-production-value YouTube marketplace templates.
const EXPLAINER_PRO: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "topic",
    "hook",
    "context",
    "point1_title",
    "point1_body",
    "point1_media",
    "point2_title",
    "point2_body",
    "point2_media",
    "point3_title",
    "point3_body",
    "point3_media",
    "recap",
    "cta"
  ],
  "scenes": [
    {
      "id": "ep-hook",
      "name": "Cold Open",
      "durationMs": 1800,
      "background": "#07111F",
      "elements": [
        {
          "id": "ep-h-accent",
          "type": "shape",
          "shape": "ellipse",
          "x": -140,
          "y": -200,
          "w": 700,
          "h": 700,
          "rotation": 0,
          "opacity": 0.32,
          "fill": "#7C3AED",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 0,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-h-kicker",
          "type": "text",
          "text": "IN 20 SECONDS",
          "x": 150,
          "y": 250,
          "w": 780,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-h-hook",
          "type": "text",
          "text": "{{hook}}",
          "x": 70,
          "y": 560,
          "w": 940,
          "h": 480,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 112,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 160,
              "durationMs": 560,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#7C3AED",
            "blur": 24,
            "intensity": 0.7
          }
        },
        {
          "id": "ep-h-topic",
          "type": "text",
          "text": "{{topic}}",
          "x": 120,
          "y": 1160,
          "w": 840,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 46,
          "fontWeight": 800,
          "color": "#A78BFA",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-h-progress",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1700,
          "w": 920,
          "h": 12,
          "rotation": 0,
          "opacity": 1,
          "fill": "#1E293B",
          "radius": 999
        },
        {
          "id": "ep-h-progress-on",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1700,
          "w": 170,
          "h": 12,
          "rotation": 0,
          "opacity": 1,
          "fill": "#A78BFA",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 300,
              "durationMs": 700,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "cameraMove": "zoomIn",
      "role": "hook",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ep-context",
      "name": "Why It Matters",
      "durationMs": 2600,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ep-c-label",
          "type": "text",
          "text": "WHY THIS MATTERS",
          "x": 90,
          "y": 170,
          "w": 900,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 4,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-c-media",
          "type": "image",
          "src": "{{point1_media}}",
          "x": 100,
          "y": 340,
          "w": 880,
          "h": 620,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "documentary",
          "colorAdjustments": {
            "brightness": 0.82,
            "contrast": 1.1,
            "saturation": 0.9
          },
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 180,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-c-panel",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1040,
          "w": 900,
          "h": 550,
          "rotation": 0,
          "opacity": 0.96,
          "fill": "#101C30",
          "radius": 46,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 260,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-c-text",
          "type": "text",
          "text": "{{context}}",
          "x": 140,
          "y": 1110,
          "w": 800,
          "h": 400,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 64,
          "fontWeight": 750,
          "color": "#F8FAFC",
          "align": "center",
          "autoFit": true,
          "maxLines": 5,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 450,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "blur",
      "cameraMove": "zoomOut",
      "role": "context",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ep-p1",
      "name": "Key Point 1",
      "durationMs": 3000,
      "background": "#081018",
      "elements": [
        {
          "id": "ep-p1-num",
          "type": "shape",
          "shape": "ellipse",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fill": "#22C55E",
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 0,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p1-n",
          "type": "text",
          "text": "01",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 70,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ep-p1-title",
          "type": "text",
          "text": "{{point1_title}}",
          "x": 270,
          "y": 140,
          "w": 730,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 78,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "left",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 120,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p1-media",
          "type": "image",
          "src": "{{point1_media}}",
          "x": 90,
          "y": 390,
          "w": 900,
          "h": 640,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "cinematic",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 250,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p1-body-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1090,
          "w": 900,
          "h": 520,
          "rotation": 0,
          "opacity": 0.97,
          "fill": "#111C2D",
          "radius": 44,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 400,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p1-body",
          "type": "text",
          "text": "{{point1_body}}",
          "x": 140,
          "y": 1150,
          "w": 800,
          "h": 390,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 700,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 5,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 600,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p1-bar",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 900,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#1E293B",
          "radius": 999
        },
        {
          "id": "ep-p1-baron",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 300,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#22C55E",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 700,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "cameraMove": "zoomIn",
      "role": "value",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ep-p2",
      "name": "Key Point 2",
      "durationMs": 3000,
      "background": "#081018",
      "elements": [
        {
          "id": "ep-p2-num",
          "type": "shape",
          "shape": "ellipse",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fill": "#F97316",
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 0,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p2-n",
          "type": "text",
          "text": "02",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 70,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ep-p2-title",
          "type": "text",
          "text": "{{point2_title}}",
          "x": 270,
          "y": 140,
          "w": 730,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 78,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "left",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 120,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p2-media",
          "type": "image",
          "src": "{{point2_media}}",
          "x": 90,
          "y": 390,
          "w": 900,
          "h": 640,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "cinematic",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 250,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p2-body-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1090,
          "w": 900,
          "h": 520,
          "rotation": 0,
          "opacity": 0.97,
          "fill": "#111C2D",
          "radius": 44,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 400,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p2-body",
          "type": "text",
          "text": "{{point2_body}}",
          "x": 140,
          "y": 1150,
          "w": 800,
          "h": 390,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 700,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 5,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 600,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p2-bar",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 900,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#1E293B",
          "radius": 999
        },
        {
          "id": "ep-p2-baron",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 600,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#F97316",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 700,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "whip",
      "cameraMove": "zoomIn",
      "role": "value",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ep-p3",
      "name": "Key Point 3",
      "durationMs": 3000,
      "background": "#081018",
      "elements": [
        {
          "id": "ep-p3-num",
          "type": "shape",
          "shape": "ellipse",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fill": "#38BDF8",
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 0,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p3-n",
          "type": "text",
          "text": "03",
          "x": 80,
          "y": 150,
          "w": 150,
          "h": 150,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 70,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ep-p3-title",
          "type": "text",
          "text": "{{point3_title}}",
          "x": 270,
          "y": 140,
          "w": 730,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 78,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "left",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 120,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p3-media",
          "type": "image",
          "src": "{{point3_media}}",
          "x": 90,
          "y": 390,
          "w": 900,
          "h": 640,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "cinematic",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 250,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p3-body-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1090,
          "w": 900,
          "h": 520,
          "rotation": 0,
          "opacity": 0.97,
          "fill": "#111C2D",
          "radius": 44,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 400,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p3-body",
          "type": "text",
          "text": "{{point3_body}}",
          "x": 140,
          "y": 1150,
          "w": 800,
          "h": 390,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 700,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 5,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 600,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-p3-bar",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 900,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#1E293B",
          "radius": 999
        },
        {
          "id": "ep-p3-baron",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1680,
          "w": 900,
          "h": 10,
          "rotation": 0,
          "opacity": 1,
          "fill": "#38BDF8",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 700,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "cameraMove": "zoomIn",
      "role": "value",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ep-recap",
      "name": "Recap + CTA",
      "durationMs": 2400,
      "background": "#111827",
      "elements": [
        {
          "id": "ep-r-small",
          "type": "text",
          "text": "SAVE THIS",
          "x": 170,
          "y": 330,
          "w": 740,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-r-main",
          "type": "text",
          "text": "{{recap}}",
          "x": 80,
          "y": 570,
          "w": 920,
          "h": 430,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 96,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 160,
              "durationMs": 540,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-r-line",
          "type": "shape",
          "shape": "rect",
          "x": 240,
          "y": 1100,
          "w": 600,
          "h": 8,
          "rotation": 0,
          "opacity": 1,
          "fill": "#A78BFA",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 450,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ep-r-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 100,
          "y": 1240,
          "w": 880,
          "h": 260,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 68,
          "fontWeight": 900,
          "color": "#A78BFA",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 600,
              "durationMs": 450,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#7C3AED",
            "blur": 16
          }
        }
      ],
      "transitionIn": "flash",
      "role": "cta",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const MYTH_FACT_PRO: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "topic",
    "hook",
    "myth",
    "fact",
    "evidence",
    "source",
    "media",
    "cta"
  ],
  "scenes": [
    {
      "id": "mf-hook",
      "name": "Hook",
      "durationMs": 1600,
      "background": "#180B12",
      "elements": [
        {
          "id": "mf-h-label",
          "type": "text",
          "text": "MYTH OR FACT?",
          "x": 150,
          "y": 240,
          "w": 780,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 44,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 6,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-h-hook",
          "type": "text",
          "text": "{{hook}}",
          "x": 80,
          "y": 580,
          "w": 920,
          "h": 500,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 110,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 160,
              "durationMs": 520,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-h-topic",
          "type": "text",
          "text": "{{topic}}",
          "x": 180,
          "y": 1240,
          "w": 720,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 48,
          "fontWeight": 800,
          "color": "#FDA4AF",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 600,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "cameraMove": "zoomIn",
      "role": "hook",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "mf-myth",
      "name": "The Myth",
      "durationMs": 2500,
      "background": "#240A12",
      "elements": [
        {
          "id": "mf-m-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 140,
          "w": 280,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#BE123C",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-m-badge-t",
          "type": "text",
          "text": "THE MYTH",
          "x": 80,
          "y": 140,
          "w": 280,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "mf-m-media",
          "type": "image",
          "src": "{{media}}",
          "x": 90,
          "y": 330,
          "w": 900,
          "h": 620,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "high-contrast",
          "colorAdjustments": {
            "saturation": 0.65,
            "contrast": 1.15
          },
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-m-text",
          "type": "text",
          "text": "“{{myth}}”",
          "x": 100,
          "y": 1050,
          "w": 880,
          "h": 450,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFE4E6",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "italic": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 350,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-m-cross",
          "type": "text",
          "text": "✕",
          "x": 430,
          "y": 1510,
          "w": 220,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 180,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 800,
              "durationMs": 350,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#FB7185",
            "blur": 20
          }
        }
      ],
      "transitionIn": "glitch",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "mf-fact",
      "name": "Fact Reveal",
      "durationMs": 2700,
      "background": "#052E2B",
      "elements": [
        {
          "id": "mf-f-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 140,
          "w": 300,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#10B981",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-f-badge-t",
          "type": "text",
          "text": "THE FACT",
          "x": 80,
          "y": 140,
          "w": 300,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#042F2E",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "mf-f-check",
          "type": "text",
          "text": "✓",
          "x": 390,
          "y": 350,
          "w": 300,
          "h": 300,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 230,
          "fontWeight": 900,
          "color": "#34D399",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 120,
              "durationMs": 500,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#34D399",
            "blur": 28
          }
        },
        {
          "id": "mf-f-text",
          "type": "text",
          "text": "{{fact}}",
          "x": 90,
          "y": 760,
          "w": 900,
          "h": 500,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 82,
          "fontWeight": 900,
          "color": "#ECFDF5",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 420,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "flash",
      "cameraMove": "zoomIn",
      "role": "payoff",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "mf-evidence",
      "name": "Evidence",
      "durationMs": 3200,
      "background": "#0B1220",
      "elements": [
        {
          "id": "mf-e-title",
          "type": "text",
          "text": "HERE'S THE PROOF",
          "x": 100,
          "y": 160,
          "w": 880,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 44,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 4,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-e-card",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 360,
          "w": 920,
          "h": 900,
          "rotation": 0,
          "opacity": 0.98,
          "fill": "#111C2D",
          "radius": 48,
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 180,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-e-body",
          "type": "text",
          "text": "{{evidence}}",
          "x": 140,
          "y": 450,
          "w": 800,
          "h": 650,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 700,
          "color": "#F1F5F9",
          "align": "left",
          "autoFit": true,
          "maxLines": 7,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 350,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-e-source",
          "type": "text",
          "text": "SOURCE • {{source}}",
          "x": 140,
          "y": 1150,
          "w": 800,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 30,
          "fontWeight": 700,
          "color": "#94A3B8",
          "align": "left",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 1300,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "mf-e-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 100,
          "y": 1470,
          "w": 880,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1700,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "blur",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const BEFORE_AFTER_PRO: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "hook",
    "before_label",
    "before_media",
    "before_problem",
    "after_label",
    "after_media",
    "after_result",
    "change1",
    "change2",
    "change3",
    "cta"
  ],
  "scenes": [
    {
      "id": "ba-hook",
      "name": "Transformation Hook",
      "durationMs": 1700,
      "background": "#0F172A",
      "elements": [
        {
          "id": "ba-h-top",
          "type": "text",
          "text": "WAIT FOR THE AFTER",
          "x": 120,
          "y": 240,
          "w": 840,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 320,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-h-main",
          "type": "text",
          "text": "{{hook}}",
          "x": 70,
          "y": 610,
          "w": 940,
          "h": 480,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 106,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 140,
              "durationMs": 540,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-h-swipe",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1510,
          "w": 920,
          "h": 18,
          "rotation": 0,
          "opacity": 1,
          "fill": "#334155",
          "radius": 999
        },
        {
          "id": "ba-h-swipe-on",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1510,
          "w": 260,
          "h": 18,
          "rotation": 0,
          "opacity": 1,
          "fill": "#FACC15",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 500,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "cameraMove": "zoomIn",
      "role": "hook",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ba-before",
      "name": "Before",
      "durationMs": 2800,
      "background": "#190D12",
      "elements": [
        {
          "id": "ba-b-title",
          "type": "text",
          "text": "BEFORE",
          "x": 90,
          "y": 140,
          "w": 900,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 72,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 8,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-b-media",
          "type": "image",
          "src": "{{before_media}}",
          "x": 90,
          "y": 340,
          "w": 900,
          "h": 850,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "cold",
          "colorAdjustments": {
            "saturation": 0.75,
            "contrast": 1.08
          },
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-b-card",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1260,
          "w": 900,
          "h": 390,
          "rotation": 0,
          "opacity": 1,
          "fill": "#2A111A",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 380,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-b-label",
          "type": "text",
          "text": "{{before_label}}",
          "x": 140,
          "y": 1300,
          "w": 800,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#FDA4AF",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "ba-b-problem",
          "type": "text",
          "text": "{{before_problem}}",
          "x": 140,
          "y": 1400,
          "w": 800,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 800,
          "color": "#FFE4E6",
          "align": "left",
          "autoFit": true,
          "maxLines": 3,
          "reveal": "wordByWord"
        }
      ],
      "transitionIn": "slideLeft",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ba-switch",
      "name": "Pattern Interrupt",
      "durationMs": 1200,
      "background": "#FACC15",
      "elements": [
        {
          "id": "ba-s",
          "type": "text",
          "text": "NOW WATCH THIS",
          "x": 80,
          "y": 710,
          "w": 920,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 105,
          "fontWeight": 900,
          "color": "#111827",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 0,
              "durationMs": 420,
              "easing": "spring"
            }
          },
          "letterSpacing": 3
        },
        {
          "id": "ba-arrow",
          "type": "text",
          "text": "↓",
          "x": 420,
          "y": 1000,
          "w": 240,
          "h": 240,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 190,
          "fontWeight": 900,
          "color": "#111827",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 280,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "flash",
      "role": "pattern-interrupt",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ba-after",
      "name": "After",
      "durationMs": 3000,
      "background": "#052E2B",
      "elements": [
        {
          "id": "ba-a-title",
          "type": "text",
          "text": "AFTER",
          "x": 90,
          "y": 140,
          "w": 900,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 72,
          "fontWeight": 900,
          "color": "#34D399",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 8,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-a-media",
          "type": "image",
          "src": "{{after_media}}",
          "x": 90,
          "y": 340,
          "w": 900,
          "h": 850,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "warm",
          "colorAdjustments": {
            "saturation": 1.1,
            "contrast": 1.08
          },
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 140,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-a-card",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1260,
          "w": 900,
          "h": 390,
          "rotation": 0,
          "opacity": 1,
          "fill": "#073F38",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 360,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-a-label",
          "type": "text",
          "text": "{{after_label}}",
          "x": 140,
          "y": 1300,
          "w": 800,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#6EE7B7",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "ba-a-result",
          "type": "text",
          "text": "{{after_result}}",
          "x": 140,
          "y": 1400,
          "w": 800,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 800,
          "color": "#ECFDF5",
          "align": "left",
          "autoFit": true,
          "maxLines": 3,
          "reveal": "wordByWord"
        }
      ],
      "transitionIn": "whip",
      "cameraMove": "zoomIn",
      "role": "payoff",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ba-how",
      "name": "What Changed",
      "durationMs": 3400,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ba-how-title",
          "type": "text",
          "text": "WHAT CHANGED?",
          "x": 100,
          "y": 180,
          "w": 880,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-c1",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 400,
          "w": 900,
          "h": 280,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 100,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-n1",
          "type": "text",
          "text": "01",
          "x": 130,
          "y": 455,
          "w": 120,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ba-t1",
          "type": "text",
          "text": "{{change1}}",
          "x": 280,
          "y": 430,
          "w": 640,
          "h": 170,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        },
        {
          "id": "ba-c2",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 750,
          "w": 900,
          "h": 280,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 250,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-n2",
          "type": "text",
          "text": "02",
          "x": 130,
          "y": 805,
          "w": 120,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ba-t2",
          "type": "text",
          "text": "{{change2}}",
          "x": 280,
          "y": 780,
          "w": 640,
          "h": 170,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        },
        {
          "id": "ba-c3",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1100,
          "w": 900,
          "h": 280,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 400,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ba-n3",
          "type": "text",
          "text": "03",
          "x": 130,
          "y": 1155,
          "w": 120,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ba-t3",
          "type": "text",
          "text": "{{change3}}",
          "x": 280,
          "y": 1130,
          "w": 640,
          "h": 170,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        },
        {
          "id": "ba-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 100,
          "y": 1540,
          "w": 880,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 64,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1500,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "blur",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const VERSUS_PRO: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "title",
    "itemA",
    "itemA_media",
    "itemA_strength",
    "itemB",
    "itemB_media",
    "itemB_strength",
    "criteria1",
    "criteria1_winner",
    "criteria2",
    "criteria2_winner",
    "criteria3",
    "criteria3_winner",
    "winner",
    "reason",
    "cta"
  ],
  "scenes": [
    {
      "id": "vs-hook",
      "name": "Versus Hook",
      "durationMs": 1800,
      "background": "#080B16",
      "elements": [
        {
          "id": "vs-title",
          "type": "text",
          "text": "{{title}}",
          "x": 80,
          "y": 270,
          "w": 920,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 72,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-a",
          "type": "text",
          "text": "{{itemA}}",
          "x": 80,
          "y": 640,
          "w": 430,
          "h": 260,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 88,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 100,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-v",
          "type": "text",
          "text": "VS",
          "x": 440,
          "y": 720,
          "w": 200,
          "h": 130,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 82,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 280,
              "durationMs": 400,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#FACC15",
            "blur": 20
          }
        },
        {
          "id": "vs-b",
          "type": "text",
          "text": "{{itemB}}",
          "x": 570,
          "y": 640,
          "w": 430,
          "h": 260,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 88,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideLeft",
              "delayMs": 100,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-sub",
          "type": "text",
          "text": "3 ROUNDS • ONE WINNER",
          "x": 140,
          "y": 1160,
          "w": 800,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 800,
          "color": "#94A3B8",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "role": "hook",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "vs-a-scene",
      "name": "Contender A",
      "durationMs": 2400,
      "background": "#061724",
      "elements": [
        {
          "id": "vs-a-img",
          "type": "image",
          "src": "{{itemA_media}}",
          "x": 80,
          "y": 270,
          "w": 920,
          "h": 700,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-a-card",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1050,
          "w": 920,
          "h": 480,
          "rotation": 0,
          "opacity": 1,
          "fill": "#0B2940",
          "radius": 48,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 350,
              "durationMs": 480,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-a-name",
          "type": "text",
          "text": "{{itemA}}",
          "x": 130,
          "y": 1110,
          "w": 820,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 64,
          "fontWeight": 900,
          "color": "#7DD3FC",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "vs-a-str",
          "type": "text",
          "text": "{{itemA_strength}}",
          "x": 130,
          "y": 1260,
          "w": 820,
          "h": 200,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 700,
          "color": "#F0F9FF",
          "align": "left",
          "autoFit": true,
          "maxLines": 3,
          "reveal": "wordByWord"
        }
      ],
      "transitionIn": "slideRight",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "vs-b-scene",
      "name": "Contender B",
      "durationMs": 2400,
      "background": "#250D18",
      "elements": [
        {
          "id": "vs-b-img",
          "type": "image",
          "src": "{{itemB_media}}",
          "x": 80,
          "y": 270,
          "w": 920,
          "h": 700,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 600,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-b-card",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 1050,
          "w": 920,
          "h": 480,
          "rotation": 0,
          "opacity": 1,
          "fill": "#421329",
          "radius": 48,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 350,
              "durationMs": 480,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-b-name",
          "type": "text",
          "text": "{{itemB}}",
          "x": 130,
          "y": 1110,
          "w": 820,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 64,
          "fontWeight": 900,
          "color": "#FDA4AF",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "vs-b-str",
          "type": "text",
          "text": "{{itemB_strength}}",
          "x": 130,
          "y": 1260,
          "w": 820,
          "h": 200,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 700,
          "color": "#FFF1F2",
          "align": "left",
          "autoFit": true,
          "maxLines": 3,
          "reveal": "wordByWord"
        }
      ],
      "transitionIn": "slideLeft",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "vs-score",
      "name": "3-Round Scorecard",
      "durationMs": 3600,
      "background": "#0B1220",
      "elements": [
        {
          "id": "vs-score-title",
          "type": "text",
          "text": "SCORECARD",
          "x": 160,
          "y": 140,
          "w": 760,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-r1",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 360,
          "w": 900,
          "h": 285,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 38,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 120,
              "durationMs": 430,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-crit1",
          "type": "text",
          "text": "{{criteria1}}",
          "x": 140,
          "y": 405,
          "w": 520,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 800,
          "color": "#CBD5E1",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "vs-win1",
          "type": "text",
          "text": "{{criteria1_winner}}",
          "x": 650,
          "y": 400,
          "w": 280,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "maxLines": 2
        },
        {
          "id": "vs-r2",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 710,
          "w": 900,
          "h": 285,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 38,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 240,
              "durationMs": 430,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-crit2",
          "type": "text",
          "text": "{{criteria2}}",
          "x": 140,
          "y": 755,
          "w": 520,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 800,
          "color": "#CBD5E1",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "vs-win2",
          "type": "text",
          "text": "{{criteria2_winner}}",
          "x": 650,
          "y": 750,
          "w": 280,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "maxLines": 2
        },
        {
          "id": "vs-r3",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1060,
          "w": 900,
          "h": 285,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 38,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 360,
              "durationMs": 430,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-crit3",
          "type": "text",
          "text": "{{criteria3}}",
          "x": 140,
          "y": 1105,
          "w": 520,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 800,
          "color": "#CBD5E1",
          "align": "left",
          "autoFit": true
        },
        {
          "id": "vs-win3",
          "type": "text",
          "text": "{{criteria3_winner}}",
          "x": 650,
          "y": 1100,
          "w": 280,
          "h": 120,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "maxLines": 2
        }
      ],
      "transitionIn": "wipe",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "vs-win",
      "name": "Winner Reveal",
      "durationMs": 2800,
      "background": "#111827",
      "elements": [
        {
          "id": "vs-win-k",
          "type": "text",
          "text": "WINNER",
          "x": 180,
          "y": 220,
          "w": 720,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 8,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-win-name",
          "type": "text",
          "text": "{{winner}}",
          "x": 90,
          "y": 520,
          "w": 900,
          "h": 300,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 130,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 200,
              "durationMs": 550,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#FACC15",
            "blur": 26
          }
        },
        {
          "id": "vs-win-why",
          "type": "text",
          "text": "{{reason}}",
          "x": 120,
          "y": 1000,
          "w": 840,
          "h": 300,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 700,
          "color": "#E2E8F0",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 600,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "vs-win-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 120,
          "y": 1460,
          "w": 840,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1300,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "flash",
      "cameraMove": "zoomIn",
      "role": "payoff",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const MINI_DOCUMENTARY: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "title",
    "cold_open",
    "media1",
    "context",
    "media2",
    "turning_point",
    "media3",
    "detail",
    "lesson",
    "source",
    "cta"
  ],
  "scenes": [
    {
      "id": "md-cold",
      "name": "Cold Open",
      "durationMs": 2000,
      "background": "#05070B",
      "elements": [
        {
          "id": "md-cold-img",
          "type": "image",
          "src": "{{media1}}",
          "x": 0,
          "y": 0,
          "w": 1080,
          "h": 1920,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "documentary",
          "colorAdjustments": {
            "brightness": 0.62,
            "contrast": 1.15,
            "grain": 0.12,
            "vignette": 0.35
          }
        },
        {
          "id": "md-cold-shade",
          "type": "shape",
          "shape": "rect",
          "x": 0,
          "y": 0,
          "w": 1080,
          "h": 1920,
          "rotation": 0,
          "opacity": 0.35,
          "fill": "#030712",
          "radius": 0
        },
        {
          "id": "md-cold-small",
          "type": "text",
          "text": "A MINI DOCUMENTARY",
          "x": 120,
          "y": 230,
          "w": 840,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 36,
          "fontWeight": 900,
          "color": "#F59E0B",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-cold-txt",
          "type": "text",
          "text": "{{cold_open}}",
          "x": 70,
          "y": 650,
          "w": 940,
          "h": 520,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 104,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 180,
              "durationMs": 600,
              "easing": "spring"
            }
          },
          "stroke": "#000000",
          "strokeWidth": 4
        }
      ],
      "transitionIn": "fade",
      "cameraMove": "zoomIn",
      "role": "hook",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "md-title",
      "name": "Title Card",
      "durationMs": 1600,
      "background": "#0B0D12",
      "elements": [
        {
          "id": "md-title-main",
          "type": "text",
          "text": "{{title}}",
          "x": 80,
          "y": 700,
          "w": 920,
          "h": 340,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 116,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 0,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-title-line",
          "type": "shape",
          "shape": "rect",
          "x": 230,
          "y": 1110,
          "w": 620,
          "h": 8,
          "rotation": 0,
          "opacity": 1,
          "fill": "#F59E0B",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 300,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "blur",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "md-context",
      "name": "Context",
      "durationMs": 3200,
      "background": "#0A0F18",
      "elements": [
        {
          "id": "md-context-img",
          "type": "image",
          "src": "{{media2}}",
          "x": 80,
          "y": 220,
          "w": 920,
          "h": 650,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "documentary",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 120,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-context-label",
          "type": "text",
          "text": "THE CONTEXT",
          "x": 100,
          "y": 930,
          "w": 880,
          "h": 70,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 34,
          "fontWeight": 900,
          "color": "#F59E0B",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 4
        },
        {
          "id": "md-context-text",
          "type": "text",
          "text": "{{context}}",
          "x": 100,
          "y": 1040,
          "w": 880,
          "h": 520,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 62,
          "fontWeight": 700,
          "color": "#F1F5F9",
          "align": "left",
          "autoFit": true,
          "maxLines": 6,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 420,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "cameraMove": "panRight",
      "role": "context",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "md-turn",
      "name": "Turning Point",
      "durationMs": 2800,
      "background": "#140B0B",
      "elements": [
        {
          "id": "md-turn-label",
          "type": "text",
          "text": "THEN EVERYTHING CHANGED",
          "x": 90,
          "y": 180,
          "w": 900,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 3,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-turn-img",
          "type": "image",
          "src": "{{media3}}",
          "x": 80,
          "y": 360,
          "w": 920,
          "h": 700,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "cinematic",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-turn-text",
          "type": "text",
          "text": "{{turning_point}}",
          "x": 100,
          "y": 1160,
          "w": 880,
          "h": 350,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 68,
          "fontWeight": 900,
          "color": "#FFF1F2",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 450,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "glitch",
      "cameraMove": "zoomIn",
      "role": "pattern-interrupt",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "md-detail",
      "name": "The Detail People Miss",
      "durationMs": 3200,
      "background": "#07111F",
      "elements": [
        {
          "id": "md-detail-k",
          "type": "text",
          "text": "THE DETAIL MOST PEOPLE MISS",
          "x": 90,
          "y": 180,
          "w": 900,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 3,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-detail-card",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 400,
          "w": 920,
          "h": 840,
          "rotation": 0,
          "opacity": 1,
          "fill": "#0F2238",
          "radius": 54,
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 160,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-detail-t",
          "type": "text",
          "text": "{{detail}}",
          "x": 140,
          "y": 500,
          "w": 800,
          "h": 630,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 64,
          "fontWeight": 750,
          "color": "#E0F2FE",
          "align": "left",
          "autoFit": true,
          "maxLines": 7,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 360,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-detail-src",
          "type": "text",
          "text": "SOURCE • {{source}}",
          "x": 140,
          "y": 1300,
          "w": 800,
          "h": 70,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 28,
          "fontWeight": 700,
          "color": "#64748B",
          "align": "left",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 1500,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "wipe",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "md-end",
      "name": "Lesson + CTA",
      "durationMs": 2600,
      "background": "#111827",
      "elements": [
        {
          "id": "md-end-k",
          "type": "text",
          "text": "THE TAKEAWAY",
          "x": 170,
          "y": 300,
          "w": 740,
          "h": 80,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#F59E0B",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-end-lesson",
          "type": "text",
          "text": "{{lesson}}",
          "x": 80,
          "y": 590,
          "w": 920,
          "h": 480,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 88,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 180,
              "durationMs": 520,
              "easing": "spring"
            }
          }
        },
        {
          "id": "md-end-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 120,
          "y": 1240,
          "w": 840,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 60,
          "fontWeight": 900,
          "color": "#F59E0B",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 800,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "fade",
      "role": "cta",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const QUIZ_LADDER: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "title",
    "cta",
    "q1",
    "a1",
    "media1",
    "q2",
    "a2",
    "media2",
    "q3",
    "a3",
    "media3",
    "q4",
    "a4",
    "media4",
    "q5",
    "a5",
    "media5"
  ],
  "scenes": [
    {
      "id": "ql-hook",
      "name": "Challenge Hook",
      "durationMs": 1800,
      "background": "#11102A",
      "elements": [
        {
          "id": "ql-k",
          "type": "text",
          "text": "5 LEVEL CHALLENGE",
          "x": 120,
          "y": 250,
          "w": 840,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 44,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-title",
          "type": "text",
          "text": "{{title}}",
          "x": 80,
          "y": 600,
          "w": 920,
          "h": 430,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 108,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 140,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-rule",
          "type": "text",
          "text": "Can you reach LEVEL 5?",
          "x": 140,
          "y": 1240,
          "w": 800,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 50,
          "fontWeight": 800,
          "color": "#C4B5FD",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "role": "hook",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ql-1",
      "name": "Level 1",
      "durationMs": 3000,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ql-1-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#22C55E",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-1-badge-t",
          "type": "text",
          "text": "LEVEL 1",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ql-1-media",
          "type": "image",
          "src": "{{media1}}",
          "x": 90,
          "y": 320,
          "w": 900,
          "h": 560,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-1-q",
          "type": "text",
          "text": "{{q1}}",
          "x": 90,
          "y": 960,
          "w": 900,
          "h": 330,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 330,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-1-timer",
          "type": "text",
          "text": "3  •  2  •  1",
          "x": 240,
          "y": 1360,
          "w": 600,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#22C55E",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 800,
              "durationMs": 300,
              "easing": "spring"
            }
          },
          "letterSpacing": 8
        },
        {
          "id": "ql-1-answer-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1510,
          "w": 900,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fill": "#22C55E",
          "radius": 38,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1900,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-1-answer",
          "type": "text",
          "text": "✓ {{a1}}",
          "x": 120,
          "y": 1540,
          "w": 840,
          "h": 160,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 2100,
              "durationMs": 300,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ql-2",
      "name": "Level 2",
      "durationMs": 3000,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ql-2-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#38BDF8",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-2-badge-t",
          "type": "text",
          "text": "LEVEL 2",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ql-2-media",
          "type": "image",
          "src": "{{media2}}",
          "x": 90,
          "y": 320,
          "w": 900,
          "h": 560,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-2-q",
          "type": "text",
          "text": "{{q2}}",
          "x": 90,
          "y": 960,
          "w": 900,
          "h": 330,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 330,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-2-timer",
          "type": "text",
          "text": "3  •  2  •  1",
          "x": 240,
          "y": 1360,
          "w": 600,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 800,
              "durationMs": 300,
              "easing": "spring"
            }
          },
          "letterSpacing": 8
        },
        {
          "id": "ql-2-answer-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1510,
          "w": 900,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fill": "#38BDF8",
          "radius": 38,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1900,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-2-answer",
          "type": "text",
          "text": "✓ {{a2}}",
          "x": 120,
          "y": 1540,
          "w": 840,
          "h": 160,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 2100,
              "durationMs": 300,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ql-3",
      "name": "Level 3",
      "durationMs": 3000,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ql-3-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#A78BFA",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-3-badge-t",
          "type": "text",
          "text": "LEVEL 3",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ql-3-media",
          "type": "image",
          "src": "{{media3}}",
          "x": 90,
          "y": 320,
          "w": 900,
          "h": 560,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-3-q",
          "type": "text",
          "text": "{{q3}}",
          "x": 90,
          "y": 960,
          "w": 900,
          "h": 330,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 330,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-3-timer",
          "type": "text",
          "text": "3  •  2  •  1",
          "x": 240,
          "y": 1360,
          "w": 600,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#A78BFA",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 800,
              "durationMs": 300,
              "easing": "spring"
            }
          },
          "letterSpacing": 8
        },
        {
          "id": "ql-3-answer-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1510,
          "w": 900,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fill": "#A78BFA",
          "radius": 38,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1900,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-3-answer",
          "type": "text",
          "text": "✓ {{a3}}",
          "x": 120,
          "y": 1540,
          "w": 840,
          "h": 160,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 2100,
              "durationMs": 300,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "whip",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ql-4",
      "name": "Level 4",
      "durationMs": 3000,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ql-4-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#F97316",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-4-badge-t",
          "type": "text",
          "text": "LEVEL 4",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ql-4-media",
          "type": "image",
          "src": "{{media4}}",
          "x": 90,
          "y": 320,
          "w": 900,
          "h": 560,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-4-q",
          "type": "text",
          "text": "{{q4}}",
          "x": 90,
          "y": 960,
          "w": 900,
          "h": 330,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 330,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-4-timer",
          "type": "text",
          "text": "3  •  2  •  1",
          "x": 240,
          "y": 1360,
          "w": 600,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#F97316",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 800,
              "durationMs": 300,
              "easing": "spring"
            }
          },
          "letterSpacing": 8
        },
        {
          "id": "ql-4-answer-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1510,
          "w": 900,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fill": "#F97316",
          "radius": 38,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1900,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-4-answer",
          "type": "text",
          "text": "✓ {{a4}}",
          "x": 120,
          "y": 1540,
          "w": 840,
          "h": 160,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 2100,
              "durationMs": 300,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "ql-5",
      "name": "Level 5",
      "durationMs": 3400,
      "background": "#0B1220",
      "elements": [
        {
          "id": "ql-5-badge",
          "type": "shape",
          "shape": "rect",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fill": "#FB7185",
          "radius": 999,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-5-badge-t",
          "type": "text",
          "text": "LEVEL 5",
          "x": 80,
          "y": 130,
          "w": 260,
          "h": 86,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 38,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "ql-5-media",
          "type": "image",
          "src": "{{media5}}",
          "x": 90,
          "y": 320,
          "w": 900,
          "h": 560,
          "rotation": 0,
          "opacity": 1,
          "fit": "cover",
          "filterPreset": "gaming",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 150,
              "durationMs": 550,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-5-q",
          "type": "text",
          "text": "{{q5}}",
          "x": 90,
          "y": 960,
          "w": 900,
          "h": 330,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 76,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 330,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-5-timer",
          "type": "text",
          "text": "3  •  2  •  1",
          "x": 240,
          "y": 1360,
          "w": 600,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 52,
          "fontWeight": 900,
          "color": "#FB7185",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 800,
              "durationMs": 300,
              "easing": "spring"
            }
          },
          "letterSpacing": 8
        },
        {
          "id": "ql-5-answer-bg",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1510,
          "w": 900,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fill": "#FB7185",
          "radius": 38,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1900,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-5-answer",
          "type": "text",
          "text": "✓ {{a5}}",
          "x": 120,
          "y": 1540,
          "w": 840,
          "h": 160,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 58,
          "fontWeight": 900,
          "color": "#07111F",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "fade",
              "delayMs": 2100,
              "durationMs": 300,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "whip",
      "cameraMove": "zoomIn",
      "role": "value",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "ql-cta",
      "name": "Score CTA",
      "durationMs": 2200,
      "background": "#21173A",
      "elements": [
        {
          "id": "ql-cta-top",
          "type": "text",
          "text": "HOW FAR DID YOU GET?",
          "x": 120,
          "y": 420,
          "w": 840,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 900,
          "color": "#C4B5FD",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 3,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-cta-main",
          "type": "text",
          "text": "{{cta}}",
          "x": 80,
          "y": 760,
          "w": 920,
          "h": 400,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 100,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 180,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "ql-cta-follow",
          "type": "text",
          "text": "COMMENT YOUR LEVEL",
          "x": 160,
          "y": 1330,
          "w": 760,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 4,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "flash",
      "role": "cta",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

const PRODUCT_REVIEW_PRO: EditorDocument = {
  "version": 1,
  "aspect": "9:16",
  "variables": [
    "product",
    "hook",
    "product_media",
    "price",
    "claim",
    "proof1",
    "proof2",
    "proof3",
    "pros",
    "cons",
    "verdict",
    "score",
    "cta"
  ],
  "scenes": [
    {
      "id": "pr-hook",
      "name": "Review Hook",
      "durationMs": 1900,
      "background": "#07111F",
      "elements": [
        {
          "id": "pr-k",
          "type": "text",
          "text": "HONEST REVIEW",
          "x": 140,
          "y": 220,
          "w": 800,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 40,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 6,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-hook",
          "type": "text",
          "text": "{{hook}}",
          "x": 70,
          "y": 560,
          "w": 940,
          "h": 460,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 104,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 150,
              "durationMs": 540,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-product",
          "type": "text",
          "text": "{{product}}",
          "x": 140,
          "y": 1190,
          "w": 800,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 50,
          "fontWeight": 900,
          "color": "#7DD3FC",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 420,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "zoom",
      "cameraMove": "zoomIn",
      "role": "hook",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "pr-show",
      "name": "Product + Claim",
      "durationMs": 2800,
      "background": "#081018",
      "elements": [
        {
          "id": "pr-img",
          "type": "image",
          "src": "{{product_media}}",
          "x": 100,
          "y": 250,
          "w": 880,
          "h": 760,
          "rotation": 0,
          "opacity": 1,
          "fit": "contain",
          "filterPreset": "high-contrast",
          "animations": {
            "in": {
              "type": "scale",
              "delayMs": 120,
              "durationMs": 650,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-price-bg",
          "type": "shape",
          "shape": "rect",
          "x": 100,
          "y": 1060,
          "w": 300,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fill": "#FACC15",
          "radius": 999,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 500,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-price",
          "type": "text",
          "text": "{{price}}",
          "x": 100,
          "y": 1060,
          "w": 300,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 44,
          "fontWeight": 900,
          "color": "#111827",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-claim",
          "type": "text",
          "text": "{{claim}}",
          "x": 100,
          "y": 1250,
          "w": 880,
          "h": 320,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 68,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "maxLines": 3,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 650,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "slideLeft",
      "role": "context",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "pr-proof",
      "name": "3 Things I Tested",
      "durationMs": 3600,
      "background": "#0B1220",
      "elements": [
        {
          "id": "pr-proof-title",
          "type": "text",
          "text": "3 THINGS I TESTED",
          "x": 100,
          "y": 150,
          "w": 880,
          "h": 100,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 46,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 4,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-p1",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 370,
          "w": 900,
          "h": 290,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 140,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-p1-n",
          "type": "text",
          "text": "01",
          "x": 130,
          "y": 430,
          "w": 120,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-p1-t",
          "type": "text",
          "text": "{{proof1}}",
          "x": 285,
          "y": 400,
          "w": 630,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        },
        {
          "id": "pr-p2",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 730,
          "w": 900,
          "h": 290,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 280,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-p2-n",
          "type": "text",
          "text": "02",
          "x": 130,
          "y": 790,
          "w": 120,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-p2-t",
          "type": "text",
          "text": "{{proof2}}",
          "x": 285,
          "y": 760,
          "w": 630,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        },
        {
          "id": "pr-p3",
          "type": "shape",
          "shape": "rect",
          "x": 90,
          "y": 1090,
          "w": 900,
          "h": 290,
          "rotation": 0,
          "opacity": 1,
          "fill": "#111C2D",
          "radius": 40,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 420,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-p3-n",
          "type": "text",
          "text": "03",
          "x": 130,
          "y": 1150,
          "w": 120,
          "h": 110,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 56,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-p3-t",
          "type": "text",
          "text": "{{proof3}}",
          "x": 285,
          "y": 1120,
          "w": 630,
          "h": 180,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "left",
          "autoFit": true,
          "maxLines": 3
        }
      ],
      "transitionIn": "wipe",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": true
      }
    },
    {
      "id": "pr-pc",
      "name": "Pros vs Cons",
      "durationMs": 3000,
      "background": "#111827",
      "elements": [
        {
          "id": "pr-pro-bg",
          "type": "shape",
          "shape": "rect",
          "x": 70,
          "y": 300,
          "w": 455,
          "h": 1050,
          "rotation": 0,
          "opacity": 1,
          "fill": "#073F38",
          "radius": 48,
          "animations": {
            "in": {
              "type": "slideRight",
              "delayMs": 0,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-con-bg",
          "type": "shape",
          "shape": "rect",
          "x": 555,
          "y": 300,
          "w": 455,
          "h": 1050,
          "rotation": 0,
          "opacity": 1,
          "fill": "#451A2A",
          "radius": 48,
          "animations": {
            "in": {
              "type": "slideLeft",
              "delayMs": 0,
              "durationMs": 500,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-pro-h",
          "type": "text",
          "text": "PROS",
          "x": 100,
          "y": 370,
          "w": 395,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 48,
          "fontWeight": 900,
          "color": "#6EE7B7",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-con-h",
          "type": "text",
          "text": "CONS",
          "x": 585,
          "y": 370,
          "w": 395,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 48,
          "fontWeight": 900,
          "color": "#FDA4AF",
          "align": "center",
          "autoFit": true
        },
        {
          "id": "pr-pro-t",
          "type": "text",
          "text": "{{pros}}",
          "x": 110,
          "y": 520,
          "w": 375,
          "h": 700,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 700,
          "color": "#ECFDF5",
          "align": "left",
          "autoFit": true,
          "maxLines": 8,
          "reveal": "wordByWord"
        },
        {
          "id": "pr-con-t",
          "type": "text",
          "text": "{{cons}}",
          "x": 595,
          "y": 520,
          "w": 375,
          "h": 700,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 54,
          "fontWeight": 700,
          "color": "#FFF1F2",
          "align": "left",
          "autoFit": true,
          "maxLines": 8,
          "reveal": "wordByWord"
        }
      ],
      "transitionIn": "blur",
      "role": "value",
      "retention": {
        "microZoom": false,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    },
    {
      "id": "pr-verdict",
      "name": "Verdict",
      "durationMs": 2800,
      "background": "#0A0F18",
      "elements": [
        {
          "id": "pr-v-k",
          "type": "text",
          "text": "FINAL VERDICT",
          "x": 160,
          "y": 220,
          "w": 760,
          "h": 90,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 42,
          "fontWeight": 900,
          "color": "#FACC15",
          "align": "center",
          "autoFit": true,
          "letterSpacing": 5,
          "animations": {
            "in": {
              "type": "slideDown",
              "delayMs": 0,
              "durationMs": 350,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-v-score",
          "type": "text",
          "text": "{{score}} / 10",
          "x": 100,
          "y": 480,
          "w": 880,
          "h": 250,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 150,
          "fontWeight": 900,
          "color": "#FFFFFF",
          "align": "center",
          "autoFit": true,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 150,
              "durationMs": 500,
              "easing": "spring"
            }
          },
          "glow": {
            "color": "#FACC15",
            "blur": 24
          }
        },
        {
          "id": "pr-v-text",
          "type": "text",
          "text": "{{verdict}}",
          "x": 100,
          "y": 860,
          "w": 880,
          "h": 360,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 68,
          "fontWeight": 800,
          "color": "#E2E8F0",
          "align": "center",
          "autoFit": true,
          "maxLines": 4,
          "reveal": "wordByWord",
          "animations": {
            "in": {
              "type": "slideUp",
              "delayMs": 500,
              "durationMs": 450,
              "easing": "spring"
            }
          }
        },
        {
          "id": "pr-v-cta",
          "type": "text",
          "text": "{{cta}}",
          "x": 120,
          "y": 1390,
          "w": 840,
          "h": 220,
          "rotation": 0,
          "opacity": 1,
          "fontFamily": "Plus Jakarta Sans",
          "fontSize": 60,
          "fontWeight": 900,
          "color": "#38BDF8",
          "align": "center",
          "autoFit": true,
          "maxLines": 2,
          "animations": {
            "in": {
              "type": "pop",
              "delayMs": 1300,
              "durationMs": 400,
              "easing": "spring"
            }
          }
        }
      ],
      "transitionIn": "flash",
      "cameraMove": "zoomIn",
      "role": "payoff",
      "retention": {
        "microZoom": true,
        "captionEmphasis": true,
        "patternInterrupt": false
      }
    }
  ]
};

export type StarterTemplate = { name: string; type: string; doc: EditorDocument };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { name: "Half-Cut Word Match — Any Word", type: "half_cut_word_match", doc: HALF_CUT_WORD_MATCH },
  { name: "Half Letter Match — Sliding Halves", type: "half_letter_match", doc: HALF_LETTER_MATCH },
  { name: "Letter Match — Complete the Word", type: "letter_match", doc: LETTER_MATCH },
  { name: "Quiz — Guess the Answer", type: "quiz",       doc: QUIZ },
  { name: "Motivation — Stoic Punch", type: "motivation", doc: MOTIVATION },
  { name: "Did You Know? — Fact",     type: "fact",       doc: FACT },
  { name: "Top 5 — Countdown",        type: "countdown",  doc: TOP5 },
  { name: "Explainer Pro \u2014 3 Key Points", type: "explainer_pro", doc: EXPLAINER_PRO },
  { name: "Myth vs Fact \u2014 Evidence Reveal", type: "myth_fact_pro", doc: MYTH_FACT_PRO },
  { name: "Before & After \u2014 Transformation Story", type: "before_after_pro", doc: BEFORE_AFTER_PRO },
  { name: "Versus Pro \u2014 A vs B Comparison", type: "versus_pro", doc: VERSUS_PRO },
  { name: "Mini Documentary \u2014 Story Arc", type: "mini_documentary", doc: MINI_DOCUMENTARY },
  { name: "Quiz Ladder \u2014 5 Levels", type: "quiz_ladder", doc: QUIZ_LADDER },
  { name: "Product Review Pro \u2014 Proof & Verdict", type: "product_review_pro", doc: PRODUCT_REVIEW_PRO },
];
