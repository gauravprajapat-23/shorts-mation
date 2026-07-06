import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_campaign",
  title: "Get campaign",
  description: "Fetch a single campaign (by id) with its queued items for the signed-in user.",
  inputSchema: {
    campaign_id: z.string().uuid().describe("Campaign UUID."),
    items_limit: z.number().int().min(1).max(200).optional().describe("Max campaign items to include (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campaign_id, items_limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    const [{ data: campaign, error: cErr }, { data: items, error: iErr }] = await Promise.all([
      client.from("campaigns").select("*").eq("id", campaign_id).maybeSingle(),
      client
        .from("campaign_items")
        .select("id,status,title,scheduled_at,youtube_video_id,error_message")
        .eq("campaign_id", campaign_id)
        .order("scheduled_at", { ascending: true })
        .limit(items_limit ?? 50),
    ]);
    if (cErr) return { content: [{ type: "text", text: cErr.message }], isError: true };
    if (!campaign) return { content: [{ type: "text", text: "Campaign not found" }], isError: true };
    if (iErr) return { content: [{ type: "text", text: iErr.message }], isError: true };
    const payload = { campaign, items: items ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});