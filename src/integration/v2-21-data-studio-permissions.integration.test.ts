import {describe,expect,it} from "vitest";
import {readFile} from "node:fs/promises";

describe("Automation Data Studio RPC permissions",()=>{
  it("allows authenticated user-owned campaign creation without anon access",async()=>{
    const sql=await readFile("supabase/migrations/20260904183000_fix_data_studio_campaign_rpc_permissions.sql","utf8");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_campaign_with_items(jsonb,jsonb) TO authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mark_data_studio_generated(uuid,uuid) TO authenticated");
    expect(sql).toContain("FROM PUBLIC,anon");
    expect(sql).toContain("t.user_id=v_user");
    expect(sql).toContain("yc.user_id=v_user");
  });
});
