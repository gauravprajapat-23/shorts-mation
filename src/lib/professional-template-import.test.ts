import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { parseTemplateImport } from "@/lib/template-io";

const fixtureUrl = new URL("../../public/templates/half-cut-word-match-pro.shorts-template.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8"));

describe("Half-Cut Word Match Pro portable template", () => {
  it("imports through the production portable-template parser", () => {
    const imported = parseTemplateImport(fixture, "half-cut-word-match-pro.shorts-template.json");
    expect(imported.name).toBe("Half-Cut Word Match Pro — Sky & Grass");
    expect(imported.type).toBe("half_cut_word_match_pro");
    expect(imported.document.version).toBe(2);
    expect(imported.document.aspect).toBe("9:16");
    expect(imported.document.scenes).toHaveLength(2);
  });

  it("materializes arbitrary words and generates half-letter motion + feedback", () => {
    const imported = parseTemplateImport(fixture);
    const result = materializeAutomationDocument(imported.document, {
      word: "MANGO",
      backgroundImage: "",
      cta: "Can you beat this score?",
    });

    expect(result.errors).toEqual([]);
    const game = result.document.scenes[0]!;
    expect(game.dynamicLayout).toBeUndefined();
    expect(game.durationMs).toBeGreaterThan(5000);
    expect(game.elements.filter((el) => el.id.startsWith("hlw-fixed-"))).toHaveLength(5);
    expect(game.elements.filter((el) => el.id.startsWith("hlw-moving-"))).toHaveLength(5);
    expect(game.elements.some((el) => el.id.startsWith("hlw-wrong-"))).toBe(true);
    expect(game.elements.some((el) => el.id.startsWith("hlw-correct-"))).toBe(true);
  });

  it("keeps the coded sky/grass fallback and optional custom background", () => {
    const imported = parseTemplateImport(fixture);
    const game = imported.document.scenes[0]!;
    expect(game.elements.some((el) => el.id === "pro-sky")).toBe(true);
    expect(game.elements.some((el) => el.id === "pro-grass")).toBe(true);
    expect(game.elements.some((el) => el.id === "pro-custom-bg" && el.type === "image")).toBe(true);
  });
});
