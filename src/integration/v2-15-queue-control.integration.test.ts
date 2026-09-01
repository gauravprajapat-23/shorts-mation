import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;

suite("V2.15 queue control state integrity", () => {
  const url = process.env.SUPABASE_TEST_URL!;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = "V2.15-test-only-Strong!123";
  let userId = "", campaignId = "", itemA = "", itemB = "", email = "";
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    if (!url || !serviceKey) throw new Error("Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY");
    email = `v215-${Date.now()}@example.test`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = created.data.user!.id;
    const campaign = await admin.from("campaigns").insert({ user_id: userId, name: "Queue test", status: "active" }).select("id").single();
    campaignId = campaign.data!.id;
    const items = await admin.from("campaign_items").insert([
      { user_id: userId, campaign_id: campaignId, content_json: {}, status: "failed", error_message: "render failed" },
      { user_id: userId, campaign_id: campaignId, content_json: {}, status: "pending" },
    ]).select("id");
    itemA = items.data![0].id; itemB = items.data![1].id;
    client = createClient(url, process.env.SUPABASE_TEST_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "", { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
  });

  afterAll(async () => {
    if (campaignId) await admin.from("campaigns").delete().eq("id", campaignId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("blocks direct authenticated queue-state updates", async () => {
    const { error } = await client.from("campaign_items").update({ status: "uploaded" as any }).eq("id", itemB);
    expect(error).toBeTruthy();
  });

  it("blocks forged uploaded inserts and direct item deletion", async () => {
    const forged = await client.from("campaign_items").insert({ user_id: userId, campaign_id: campaignId, content_json: {}, status: "uploaded" as any });
    expect(forged.error).toBeTruthy();
    const deleted = await client.from("campaign_items").delete().eq("id", itemB);
    expect(deleted.error).toBeTruthy();
  });

  it("retries a failed item through the stage-aware RPC", async () => {
    const { data, error } = await (client as any).rpc("retry_campaign_item", { p_item_id: itemA });
    expect(error).toBeNull();
    expect(data?.[0]?.retry_stage).toBe("render");
    const row = await admin.from("campaign_items").select("status,retry_count,error_message").eq("id", itemA).single();
    expect(row.data?.status).toBe("pending");
    expect(row.data?.retry_count).toBe(1);
    expect(row.data?.error_message).toBeNull();
  });

  it("commits valid bulk schedule updates together", async () => {
    const when = new Date(Date.now() + 3_600_000).toISOString();
    const { data, error } = await (client as any).rpc("bulk_update_queue_items", {
      p_campaign_id: campaignId,
      p_updates: [{ id: itemA, schedule_at: when }, { id: itemB, schedule_at: when }],
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(2);
    const rows = await admin.from("campaign_items").select("id,schedule_at").in("id", [itemA, itemB]);
    expect(rows.data?.every((r) => !!r.schedule_at)).toBe(true);
  });
});
