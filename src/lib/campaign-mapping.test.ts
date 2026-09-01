import { describe, expect, it } from "vitest";
import { campaignSourceValue, displayCampaignValue, hasCampaignValue } from "@/lib/campaign-mapping";

describe("campaign structured mappings", () => {
  it("preserves arrays and objects for V2.11 dynamic variables", () => {
    const rows = [{ title: "One" }, { title: "Two" }];
    const video = { content: { rows, config: { theme: "dark" } }, seo: { title: "SEO" } };
    expect(campaignSourceValue(video, "rows")).toBe(rows);
    expect(campaignSourceValue(video, "config")).toEqual({ theme: "dark" });
    expect(displayCampaignValue(rows)).toBe('[{"title":"One"},{"title":"Two"}]');
    expect(hasCampaignValue(rows)).toBe(true);
  });
});
