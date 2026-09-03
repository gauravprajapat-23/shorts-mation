import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignCreateItem = {
  video_file_name: string;
  content_json: Record<string, unknown>;
  seo_json: Record<string, unknown>;
  youtube_settings_json: Record<string, unknown>;
  audio_json: Record<string, unknown>;
  asset_json: Record<string, unknown>;
  schedule_at: string | null;
};

export const createCampaignWithItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    campaign: {
      name: string;
      youtube_connection_id: string | null;
      template_id: string;
      timezone: string;
      status?: "draft" | "active";
      settings_json: Record<string, unknown>;
    };
    items: CampaignCreateItem[];
  }) => d)
  .handler(async ({ data, context }) => {
    if (!data.campaign.name?.trim()) throw new Error("Campaign name is required");
    if (!data.campaign.template_id) throw new Error("Template is required");
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 5000) throw new Error("Campaign must contain 1–5000 videos");
    const { data: result, error } = await (context.supabase as any).rpc("create_campaign_with_items", {
      p_campaign: data.campaign,
      p_items: data.items,
    });
    if (error) throw new Error(error.message);
    const id = Array.isArray(result) ? result[0]?.campaign_id : result?.campaign_id ?? result;
    if (!id) throw new Error("Campaign transaction did not return an id");
    return { campaignId: String(id) };
  });
