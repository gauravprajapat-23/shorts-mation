import {describe,expect,it} from "vitest";
import {readFile} from "node:fs/promises";
describe("pre-added template marketplace",()=>{
  it("does not expose the legacy Starters copy action",async()=>{
    const page=await readFile("src/routes/_app/templates/index.tsx","utf8");
    expect(page).not.toContain("loadStarters");
    expect(page).not.toContain("> Starters<");
    expect(page).not.toContain('STARTER_TEMPLATES');
    expect(page).toContain('useState<Tab>("marketplace")');
  });
  it("cleans only unused untouched legacy private starter copies",async()=>{
    const sql=await readFile("supabase/migrations/20260905150000_template_marketplace_preadded_catalog_cleanup.sql","utf8");
    expect(sql).toContain("t.remix_of IS NULL");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("c.template_id = t.id");
    expect(sql).toContain("WHERE is_default = true AND user_id IS NULL");
  });
});