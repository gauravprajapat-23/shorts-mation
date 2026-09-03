import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";
import { campaignAutomationInput, materializeCampaignRenderDocument } from "@/lib/render-materialization";

describe("production render materialization", () => {
  it("preserves structured automation input instead of flattening arrays/objects", () => {
    const input = campaignAutomationInput({ items: [{ title: "A" }, { title: "B" }], _raw: { ignored: true } });
    expect(input.items).toEqual([{ title: "A" }, { title: "B" }]);
    expect(input).not.toHaveProperty("_raw");
  });

  it("materializes the Any-Word Half-Cut template for unattended renders", () => {
    const starter = STARTER_TEMPLATES.find((item) => item.type === "half_cut_word_match");
    expect(starter).toBeTruthy();
    const result = materializeCampaignRenderDocument(starter!.doc, { word: "MANGO", backgroundImage: "", cta: "Again?" });
    const scene = result.document.scenes[0]!;
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-fixed-half-"))).toHaveLength(5);
    expect(scene.elements.filter((el) => el.id.startsWith("hlw-moving-half-"))).toHaveLength(5);
    expect(scene.durationMs).toBeGreaterThan(4000);
  });
});
