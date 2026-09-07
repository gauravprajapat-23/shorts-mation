import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { campaignAutomationInput, materializeCampaignRenderComposition } from "@/lib/render-materialization";

describe("production render materialization", () => {
  it("preserves structured automation input instead of flattening arrays/objects", () => {
    const input = campaignAutomationInput({ items: [{ title: "A" }, { title: "B" }], _raw: { ignored: true } });
    expect(input.items).toEqual([{ title: "A" }, { title: "B" }]);
    expect(input).not.toHaveProperty("_raw");
  });

  it("materializes unattended renders through the canonical composition envelope", () => {
    const starter = STARTER_TEMPLATES.find((item) => item.type === "half_cut_word_match");
    expect(starter).toBeTruthy();
    const result = materializeCampaignRenderComposition(starter!.doc, { word: "MANGO", backgroundImage: "", cta: "Again?" }, {
      compositionId: "campaign-item:test",
      createdAt: "2026-09-07T00:00:00.000Z",
    });
    expect(result.composition.schema).toBe("shorts-mation/composition");
    expect(result.composition.version).toBe(1);
    expect(result.composition.document.version).toBe(2);
    const scene = result.composition.document.scenes[0]!;
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-fixed-half-"))).toHaveLength(5);
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-moving-half-"))).toHaveLength(5);
    expect(result.durationMs).toBeGreaterThan(4000);
  });
});
