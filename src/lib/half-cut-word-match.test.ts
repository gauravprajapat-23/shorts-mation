import { describe, expect, it } from "vitest";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { generateSampleCsv } from "@/lib/sample-csv";

function starter() {
  const template = STARTER_TEMPLATES.find((item) => item.type === "half_cut_word_match");
  if (!template) throw new Error("Half-Cut Word Match starter is missing");
  return template;
}

describe("Half-Cut Word Match — Any Word", () => {
  it("generates one fixed and one completed half per character from a single word input", () => {
    const { document, errors } = materializeAutomationDocument(starter().doc, { word: "MANGO", backgroundImage: "", cta: "Again?" });
    expect(errors).toEqual([]);
    const scene = document.scenes[0]!;
    expect(scene.durationMs).toBeGreaterThan(5000);
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-fixed-"))).toHaveLength(5);
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-complete-half-"))).toHaveLength(5);
    expect(scene.elements.some((el) => el.id.startsWith("hlw-wrong-"))).toBe(true);
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-moving-"))).toHaveLength(5);
  });

  it("handles repeated letters by matching the first still-unmatched identical slot", () => {
    const { document } = materializeAutomationDocument(starter().doc, { word: "APPLE", backgroundImage: "" });
    const scene = document.scenes[0]!;
    const completed = scene.elements.filter((el) => el.id.startsWith("hlw-complete-half-"));
    expect(completed).toHaveLength(5);
    expect(new Set(completed.map((el) => el.id)).size).toBe(5);
  });

  it("uses editable sky/grass by default and a custom image when supplied", () => {
    const defaultResult = materializeAutomationDocument(starter().doc, { word: "HOUSE", backgroundImage: "" }).document.scenes[0]!;
    expect(defaultResult.elements.some((el) => el.id === "hlw-bg-sky")).toBe(true);
    expect(defaultResult.elements.some((el) => el.id === "hlw-bg-grass")).toBe(true);
    expect(defaultResult.elements.some((el) => el.id === "hlw-custom-background")).toBe(false);

    const customResult = materializeAutomationDocument(starter().doc, { word: "HOUSE", backgroundImage: "https://example.com/bg.jpg" }).document.scenes[0]!;
    expect(customResult.elements.some((el) => el.id === "hlw-bg-sky")).toBe(false);
    expect(customResult.elements.some((el) => el.id === "hlw-bg-grass")).toBe(false);
    const image = customResult.elements.find((el) => el.id === "hlw-custom-background");
    expect(image?.type).toBe("image");
    if (image?.type === "image") expect(image.src).toBe("https://example.com/bg.jpg");
  });

  it("generates sample CSV rows for arbitrary word lengths", () => {
    const csv = generateSampleCsv(starter().name, starter().doc);
    expect(csv).toContain("APPLE");
    expect(csv).toContain("MANGO");
    expect(csv).toContain("ZEBRA");
    expect(csv).toContain("HOUSE");
  });
});
