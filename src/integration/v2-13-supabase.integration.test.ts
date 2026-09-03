import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const suite = enabled ? describe : describe.skip;

suite("V2.13 Supabase tenant and queue integrity", () => {
  const url = process.env.SUPABASE_TEST_URL!;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let userA = "", userB = "", templateA = "", connectionB = "", campaignA = "", itemA = "";

  beforeAll(async () => {
    if (!url || !serviceKey) throw new Error("Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY");
    const a = await admin.auth.admin.createUser({ email: `v213-a-${Date.now()}@example.test`, email_confirm: true });
    const b = await admin.auth.admin.createUser({ email: `v213-b-${Date.now()}@example.test`, email_confirm: true });
    userA = a.data.user!.id; userB = b.data.user!.id;
    const t = await admin.from("templates").insert({ user_id: userA, name: "A", type: "shorts", aspect_ratio: "9:16", template_json: { version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "s", durationMs: 1000, background: "#000", elements: [] }] }, is_default: false }).select("id").single();
    templateA = t.data!.id;
    const y = await admin.from("youtube_connections").insert({ user_id: userB, channel_id: `ch-${Date.now()}`, channel_name: "B" }).select("id").single();
    connectionB = y.data!.id;
    const c = await admin.from("campaigns").insert({ user_id: userA, name: "A campaign", template_id: templateA, status: "draft" }).select("id").single();
    campaignA = c.data!.id;
    const item = await admin.from("campaign_items").insert({ user_id: userA, campaign_id: campaignA, content_json: {}, status: "pending" }).select("id").single();
    itemA = item.data!.id;
  });

  afterAll(async () => {
    if (campaignA) await admin.from("campaigns").delete().eq("id", campaignA);
    if (connectionB) await admin.from("youtube_connections").delete().eq("id", connectionB);
    if (templateA) await admin.from("templates").delete().eq("id", templateA);
    if (userA) await admin.auth.admin.deleteUser(userA);
    if (userB) await admin.auth.admin.deleteUser(userB);
  });

  it("rejects a campaign that references another tenant's YouTube connection", async () => {
    const { error } = await admin.from("campaigns").update({ youtube_connection_id: connectionB }).eq("id", campaignA);
    expect(error).toBeTruthy();
  });

  it("rejects a campaign item whose user differs from campaign owner", async () => {
    const { error } = await admin.from("campaign_items").insert({ user_id: userB, campaign_id: campaignA, content_json: {}, status: "pending" });
    expect(error).toBeTruthy();
  });

  it("allows exactly one concurrent render claim", async () => {
    const calls = Array.from({ length: 8 }, (_, index) => (admin as any).rpc("claim_render_item", {
      p_item_id: itemA,
      p_worker_id: `test-worker-${index}`,
      p_idempotency_key: `test-render-${itemA}-${index}-${Date.now()}`,
    }));
    const results = await Promise.all(calls);
    const claimed = results.flatMap((r: any) => r.data ?? []);
    expect(claimed).toHaveLength(1);
  });
});
