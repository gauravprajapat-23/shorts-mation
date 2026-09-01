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

export type StarterTemplate = { name: string; type: string; doc: EditorDocument };

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { name: "Half Letter Match — Sliding Halves", type: "half_letter_match", doc: HALF_LETTER_MATCH },
  { name: "Letter Match — Complete the Word", type: "letter_match", doc: LETTER_MATCH },
  { name: "Quiz — Guess the Answer", type: "quiz",       doc: QUIZ },
  { name: "Motivation — Stoic Punch", type: "motivation", doc: MOTIVATION },
  { name: "Did You Know? — Fact",     type: "fact",       doc: FACT },
  { name: "Top 5 — Countdown",        type: "countdown",  doc: TOP5 },
];
