import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("campaign native worker wiring", () => {
  it("has no active Shotstack calls", async () => {
    for (const file of [
      "src/lib/render-pipeline.server.ts",
      "src/lib/render-settings.functions.ts",
      "src/lib/render-settings.server.ts",
      "src/routes/_app/settings.tsx",
    ]) {
      const source = await readFile(file, "utf8");
      expect(source.toLowerCase()).not.toContain("shotstack");
    }
  });

  it("uses the production native renderer for manual MP4 generation", async () => {
    const source = await readFile("src/routes/_app/campaigns/$campaignId.test-render.tsx", "utf8");
    expect(source).toContain("renderCampaignItemNow");
    expect(source).toContain("getCampaignItemRenderStatus");
    expect(source).toContain("getCampaignItemRenderDownload");
    expect(source).not.toContain("attachBrowserRenderedOutput");
    expect(source).not.toContain('import("@/lib/ffmpeg-render")');
  });
});
