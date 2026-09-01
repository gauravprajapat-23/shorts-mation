import { describe, expect, it } from "vitest";
import { materializeAutomationDocument, validateAutomationInputs } from "@/lib/automation-variables";
import type { EditorDocumentV2 } from "@/lib/types";

function doc(): EditorDocumentV2 {
  return {
    version: 2, aspect: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 2000,
    variables: ["title", "items", "showCta"],
    automationVariables: [
      { id: "v1", name: "title", type: "text", required: true, validation: { minLength: 3 } },
      { id: "v2", name: "items", type: "array", itemType: "object", required: true },
      { id: "v3", name: "showCta", type: "boolean", defaultValue: false },
    ],
    tracks: [], audioClips: [], captionClips: [], effectClips: [], audioMix: { duckingEnabled: true, duckLevel: .2, attackMs: 100, releaseMs: 200 },
    scenes: [{
      id: "s", name: "Item {{index}}", durationMs: 2000, background: "#000", repeat: { variable: "items", itemAlias: "item", indexAlias: "index" },
      elements: [
        { id: "t", type: "text", text: "{{item.title}}", x: 0, y: 0, w: 500, h: 100, rotation: 0, opacity: 1, fontFamily: "Inter", fontSize: 50, fontWeight: 700, color: "#fff", align: "center" },
        { id: "cta", type: "text", text: "CTA", x: 0, y: 120, w: 500, h: 100, rotation: 0, opacity: 1, fontFamily: "Inter", fontSize: 40, fontWeight: 700, color: "#fff", align: "center", visibleWhen: { variable: "showCta", operator: "truthy" } },
      ],
    }],
  };
}

describe("automation variables", () => {
  it("validates required typed inputs", () => {
    const result = validateAutomationInputs(doc(), { title: "Hi", items: [] });
    expect(result.errors.map((e) => e.variable)).toContain("title");
    expect(result.errors.map((e) => e.variable)).toContain("items");
  });

  it("repeats scenes and resolves object aliases", () => {
    const result = materializeAutomationDocument(doc(), { title: "Hello", items: [{ title: "One" }, { title: "Two" }], showCta: false });
    expect(result.document.scenes).toHaveLength(2);
    expect(result.document.scenes[0]?.name).toBe("Item 1");
    expect(result.document.scenes[0]?.elements[0]?.type === "text" && result.document.scenes[0].elements[0].text).toBe("One");
    expect(result.document.scenes[1]?.elements[0]?.type === "text" && result.document.scenes[1].elements[0].text).toBe("Two");
    expect(result.document.scenes[0]?.elements.some((el) => el.id.includes("cta"))).toBe(false);
  });

  it("accepts JSON array strings used by server campaign rendering", () => {
    const result = materializeAutomationDocument(doc(), { title: "Hello", items: JSON.stringify([{ title: "A" }]), showCta: "true" });
    expect(result.document.scenes).toHaveLength(1);
    expect(result.document.scenes[0]?.elements).toHaveLength(2);
  });
});
