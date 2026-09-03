import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;

suite("V2.16 workflow consistency", () => {
  const url = process.env.SUPABASE_TEST_URL!;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = "V2.16-test-only-Strong!123";
  let userId = "", email = "", templateId = "", connectionId = "", campaignId = "", uploadItemId = "";
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    if (!url || !serviceKey || !anonKey) throw new Error("Set SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY and SUPABASE_TEST_ANON_KEY");
    email = `v216-${Date.now()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = created.data.user!.id;
    const tpl = await admin.from("templates").insert({
      user_id: userId, name: "V2.16 template", type: "shorts", aspect_ratio: "9:16", is_default: false,
      template_json: { version: 1, aspect: "9:16", variables: ["word"], scenes: [{ id: "s", name: "s", durationMs: 1000, background: "#000", elements: [] }] },
    }).select("id").single();
    templateId = tpl.data!.id;
    client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  });

  afterAll(async () => {
    if (campaignId) await admin.from("campaigns").delete().eq("id", campaignId);
    if (connectionId) await admin.from("youtube_connections").delete().eq("id", connectionId);
    if (templateId) await admin.from("templates").delete().eq("id", templateId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("rolls back campaign creation when any item is invalid", async () => {
    const name = `rollback-${Date.now()}`;
    const result = await (client as any).rpc("create_campaign_with_items", {
      p_campaign: { name, template_id: templateId, timezone: "UTC", status: "draft", settings_json: {} },
      p_items: [
        { video_file_name: "a.mp4", content_json: { word: "APPLE" }, schedule_at: new Date(Date.now() + 3_600_000).toISOString() },
        { video_file_name: "b.mp4", content_json: { word: "MANGO" }, schedule_at: "not-a-date" },
      ],
    });
    expect(result.error).toBeTruthy();
    const check = await admin.from("campaigns").select("id", { count: "exact" }).eq("user_id", userId).eq("name", name);
    expect(check.data ?? []).toHaveLength(0);
  });

  it("creates campaign and scheduled items atomically, then enforces activation preflight", async () => {
    const t1 = new Date(Date.now() + 3_600_000).toISOString();
    const t2 = new Date(Date.now() + 7_200_000).toISOString();
    const result = await (client as any).rpc("create_campaign_with_items", {
      p_campaign: { name: "Atomic V2.16", template_id: templateId, timezone: "UTC", status: "draft", settings_json: {} },
      p_items: [
        { video_file_name: "a.mp4", content_json: { word: "APPLE" }, schedule_at: t1 },
        { video_file_name: "b.mp4", content_json: { word: "MANGO" }, schedule_at: t2 },
      ],
    });
    expect(result.error).toBeNull();
    campaignId = result.data?.[0]?.campaign_id;
    expect(campaignId).toBeTruthy();
    const items = await admin.from("campaign_items").select("schedule_at,render_due_at,upload_due_at").eq("campaign_id", campaignId);
    expect(items.data).toHaveLength(2);
    expect(items.data?.every((row) => row.schedule_at && row.render_due_at && row.upload_due_at)).toBe(true);

    const withoutChannel = await client.from("campaigns").update({ status: "active" as any }).eq("id", campaignId);
    expect(withoutChannel.error).toBeTruthy();
    const yc = await admin.from("youtube_connections").insert({ user_id: userId, channel_id: `v216-${Date.now()}`, channel_name: "V2.16 test" }).select("id").single();
    connectionId = yc.data!.id;
    const active = await client.from("campaigns").update({ youtube_connection_id: connectionId, status: "active" as any }).eq("id", campaignId);
    expect(active.error).toBeNull();
  });

  it("recovers a crashed scheduled YouTube upload as scheduled, not uploaded", async () => {
    const publishAt = new Date(Date.now() + 86_400_000).toISOString();
    const item = await admin.from("campaign_items").insert({
      user_id: userId, campaign_id: campaignId, video_file_name: "recover.mp4", content_json: {},
      status: "rendered", rendered_video_url: `${userId}/recover.mp4`, schedule_at: publishAt,
    }).select("id").single();
    uploadItemId = item.data!.id;
    const first = await (admin as any).rpc("claim_upload_item", { p_item_id: uploadItemId, p_worker_id: "v216-a", p_idempotency_key: `v216-a-${Date.now()}` });
    const attemptId = first.data?.[0]?.attempt_id;
    expect(attemptId).toBeTruthy();
    await (admin as any).from("upload_attempts").update({
      youtube_video_id: "yt-recovered-v216", intended_publish_at: publishAt, intended_final_status: "scheduled",
    }).eq("id", attemptId);
    await (admin as any).rpc("claim_upload_item", { p_item_id: uploadItemId, p_worker_id: "v216-b", p_idempotency_key: `v216-b-${Date.now()}` });
    const recovered = await admin.from("campaign_items").select("status,youtube_video_id,youtube_publish_at").eq("id", uploadItemId).single();
    expect(recovered.data?.status).toBe("scheduled");
    expect(recovered.data?.youtube_video_id).toBe("yt-recovered-v216");
    expect(new Date(recovered.data!.youtube_publish_at!).toISOString()).toBe(new Date(publishAt).toISOString());
  });
});
