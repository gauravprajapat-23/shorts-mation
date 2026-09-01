import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { extractVariables } from "@/lib/editor-defaults";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { migrateEditorDocument } from "@/lib/editor-document-v2";

const letterMatch = () => {
  const template = STARTER_TEMPLATES.find((item) => item.type === "letter_match");
  if (!template) throw new Error("Letter Match starter is missing");
  return template;
};

describe("Letter Match starter template", () => {
  it("exposes all fields required for bulk-generated match videos", () => {
    const vars = extractVariables(letterMatch().doc);
    expect(vars).toEqual(expect.arrayContaining([
      "word",
      "missingLetter",
      "optionA",
      "optionB",
      "optionC",
      "objectImage",
      "clue",
      "cta",
    ]));
  });

  it("materializes a concrete challenge without unresolved template tokens", () => {
    const { document, errors } = materializeAutomationDocument(letterMatch().doc, {
      word: "_NT",
      missingLetter: "A",
      optionA: "A",
      optionB: "O",
      optionC: "E",
      objectImage: "https://cdn.example.com/ant.png",
      clue: "A tiny insect",
      cta: "Comment your score!",
    });

    expect(errors).toEqual([]);
    const serialized = JSON.stringify(document);
    expect(serialized).toContain("_NT");
    expect(serialized).toContain("https://cdn.example.com/ant.png");
    expect(serialized).not.toMatch(/\{\{(?:word|missingLetter|optionA|optionB|optionC|objectImage|clue|cta)\}\}/);
  });

  it("migrates into the V2 timeline used by preview and renderers", () => {
    const migrated = migrateEditorDocument(letterMatch().doc);
    expect(migrated.version).toBe(2);
    expect(migrated.scenes).toHaveLength(4);
    expect(migrated.durationMs).toBeGreaterThan(10_000);
    expect(migrated.tracks.length).toBeGreaterThan(0);
  });
});

describe("Half Letter Match starter template", () => {
  const halfLetterMatch = () => {
    const template = STARTER_TEMPLATES.find((item) => item.type === "half_letter_match");
    if (!template) throw new Error("Half Letter Match starter is missing");
    return template;
  };

  it("uses real 50/50 clipped halves and reverse-order motion", () => {
    const doc = halfLetterMatch().doc;
    expect(doc.version).toBe(2);
    if (doc.version !== 2) throw new Error("Expected V2 half-letter template");
    const scene = doc.scenes.find((item) => item.id === "hlm-game");
    expect(scene).toBeTruthy();
    const leftA = scene?.elements.find((el) => el.id === "hlm-l1-left");
    const movingT = scene?.elements.find((el) => el.id === "hlm-l3-right");
    expect(leftA?.type === "text" ? leftA.clipInsetPct?.right : undefined).toBe(50);
    expect(movingT?.type === "text" ? movingT.clipInsetPct?.left : undefined).toBe(50);
    expect(movingT?.keyframes?.map((frame) => frame.values.x)).toEqual(expect.arrayContaining([90, 400, 710]));
  });

  it("contains wrong/correct feedback SFX and materializes ANT cleanly", () => {
    const template = halfLetterMatch();
    if (template.doc.version !== 2) throw new Error("Expected V2 half-letter template");
    expect(template.doc.audioClips.filter((clip) => clip.name === "Wrong match")).toHaveLength(3);
    expect(template.doc.audioClips.filter((clip) => clip.name === "Correct match")).toHaveLength(3);
    const { document, errors } = materializeAutomationDocument(template.doc, {
      word: "ANT", letter1: "A", letter2: "N", letter3: "T", cta: "Did you match all 3?",
    });
    expect(errors).toEqual([]);
    expect(JSON.stringify(document)).not.toMatch(/\{\{(?:word|letter1|letter2|letter3|cta)\}\}/);
  });
});
