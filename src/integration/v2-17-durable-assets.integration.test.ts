import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;

suite("V2.17 durable assets", () => {
  const url = process.env.SUPABASE_TEST_URL!;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = "V2.17-test-only-Strong!123";
  let userId = "", templateId = "", campaignId = "", itemId = "", oldId = "", newId = "";
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const email = `v217-${Date.now()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = created.data.user!.id;
    client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    oldId = crypto.randomUUID(); newId = crypto.randomUUID();
    await admin.from("assets").insert([
      { id: oldId, user_id: userId, type: "image", file_name: "old.png", file_url: `asset://${oldId}`, storage_path: `${userId}/old.png`, size: 10, mime_type: "image/png", content_hash: `old-${Date.now()}` } as any,
      { id: newId, user_id: userId, type: "image", file_name: "new.png", file_url: `asset://${newId}`, storage_path: `${userId}/new.png`, size: 12, mime_type: "image/png", content_hash: `new-${Date.now()}` } as any,
    ]);
  });

  afterAll(async () => {
    if (campaignId) await admin.from("campaigns").delete().eq("id", campaignId);
    if (templateId) await admin.from("templates").delete().eq("id", templateId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("indexes durable refs from templates and campaign items", async () => {
    const tpl = await admin.from("templates").insert({ user_id: userId, name: "Asset ref", type: "shorts", aspect_ratio: "9:16", is_default: false,
      template_json: { version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "S", durationMs: 1000, background: "#000", elements: [{ id: "i", type: "image", src: `asset://${oldId}`, x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, fit: "cover" }] }] } as any,
    }).select("id").single();
    templateId = tpl.data!.id;
    const campaign = await admin.from("campaigns").insert({ user_id: userId, name: "Asset campaign", template_id: templateId, status: "draft", timezone: "UTC" }).select("id").single();
    campaignId = campaign.data!.id;
    const item = await admin.from("campaign_items").insert({ user_id: userId, campaign_id: campaignId, video_file_name: "x.mp4", status: "pending", content_json: { background: `asset://${oldId}` } }).select("id").single();
    itemId = item.data!.id;
    const asset = await (admin as any).from("assets").select("usage_count").eq("id", oldId).single();
    expect(Number(asset.data?.usage_count)).toBe(2);
  });

  it("replaces an asset atomically in templates and campaign JSON", async () => {
    const replaced = await (client as any).rpc("replace_asset_everywhere", { p_old_asset: oldId, p_new_asset: newId });
    expect(replaced.error).toBeNull();
    const tpl = await admin.from("templates").select("template_json").eq("id", templateId).single();
    const item = await admin.from("campaign_items").select("content_json").eq("id", itemId).single();
    expect(JSON.stringify(tpl.data?.template_json)).toContain(newId);
    expect(JSON.stringify(tpl.data?.template_json)).not.toContain(oldId);
    expect(JSON.stringify(item.data?.content_json)).toContain(newId);
    const rows = await (admin as any).from("assets").select("id,usage_count").in("id", [oldId,newId]);
    const counts = Object.fromEntries((rows.data ?? []).map((r: any) => [r.id, Number(r.usage_count)]));
    expect(counts[oldId]).toBe(0);
    expect(counts[newId]).toBe(2);
  });

  it("enforces the configured storage quota at the database boundary", async () => {
    await (admin as any).from("user_storage_quotas").upsert({ user_id: userId, quota_bytes: 30 });
    const result = await (client as any).from("assets").insert({ user_id: userId, type: "image", file_name: "too-big.png", file_url: `asset://${crypto.randomUUID()}`, size: 100, mime_type: "image/png" });
    expect(result.error).toBeTruthy();
  });
});
