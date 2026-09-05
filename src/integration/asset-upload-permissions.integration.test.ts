import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("asset upload permission repair", () => {
  it("restores safe browser quota lookup and user-folder storage policies", async () => {
    const sql = await readFile(
      "supabase/migrations/20260905124500_fix_asset_upload_permissions_and_bucket.sql",
      "utf8",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.asset_storage_usage(uuid) TO authenticated");
    expect(sql).toContain("bucket_id = 'assets'");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toContain("INSERT INTO storage.buckets");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.replace_asset_everywhere(uuid,uuid) TO authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.list_unused_asset_candidates(integer) TO authenticated");
  });
});
