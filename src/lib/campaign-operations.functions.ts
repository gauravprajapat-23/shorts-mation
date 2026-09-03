import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; name?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context.supabase as any).rpc("duplicate_campaign", { p_campaign_id: data.campaignId, p_name: data.name ?? null });
    if (error) throw new Error(error.message);
    return { campaignId: String(id) };
  });

export const setCampaignItemPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; paused: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("set_campaign_item_paused", { p_item_id: data.itemId, p_paused: data.paused });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok), paused: data.paused };
  });

export const retrySelectedCampaignItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; itemIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.itemIds.length || data.itemIds.length > 500) throw new Error("Select 1–500 failed videos");
    const { data: count, error } = await (context.supabase as any).rpc("retry_selected_campaign_items", { p_campaign_id: data.campaignId, p_item_ids: data.itemIds });
    if (error) throw new Error(error.message);
    return { retried: Number(count ?? 0) };
  });
