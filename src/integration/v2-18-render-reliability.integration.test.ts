import { describe, expect, it } from "vitest";

const run = process.env.RUN_SUPABASE_INTEGRATION === "1" ? describe : describe.skip;

run("V2.18 render reliability database contract", () => {
  it("requires the V2.18 migration to expose budgets, logs, cancellation and dead-letter recovery", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile("supabase/migrations/20260903121500_v2_18_render_reliability_cost_control.sql", "utf8");
    expect(sql).toContain("render_budgets");
    expect(sql).toContain("render_logs");
    expect(sql).toContain("cancel_render_item");
    expect(sql).toContain("recover_dead_letter_render");
    expect(sql).toContain("render_dead_lettered_at");
  });
});
