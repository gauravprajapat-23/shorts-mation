import { describe, expect, it } from "vitest";

const run = process.env.RUN_SUPABASE_INTEGRATION === "1" ? describe : describe.skip;

run("V2.19 campaign operations database contract", () => {
  it("ships pause/resume, duplicate, retry-selected and pause-aware claims", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile("supabase/migrations/20260903133000_v2_19_campaign_operations.sql", "utf8");
    for (const invariant of ["set_campaign_item_paused", "duplicate_campaign", "retry_selected_campaign_items", "is_paused=false", "claim_render_item", "claim_upload_item"]) {
      expect(sql).toContain(invariant);
    }
  });
});
