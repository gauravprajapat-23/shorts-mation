import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AutomationItem = {
  id: string;
  video_file_name: string | null;
  title: string | null;
  status: string;
  schedule_at: string | null;
  render_due_at: string | null;
  upload_due_at: string | null;
  render_provider: string | null;
  render_job_ref: string | null;
  render_submitted_at: string | null;
  rendered_video_url: string | null;
  youtube_publish_at: string | null;
  youtube_url: string | null;
  error_message: string | null;
};

export type AutomationStatus = {
  serverRenderConfigured: boolean;
  renderLeadMinutes: number;
  uploadLeadMinutes: number;
  campaignStatus: string | null;
  counts: {
    total: number;
    waiting: number;
    rendering: number;
    rendered: number;
    scheduled: number;
    published: number;
    failed: number;
  };
  items: AutomationItem[];
  logs: Array<{ id: string; level: string; message: string; created_at: string }>;
};

/** Everything the automation view needs. All state lives in the database, so it
 *  keeps advancing (and stays accurate) with the browser tab closed. */
export const getAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }): Promise<AutomationStatus> => {
    const { supabase } = context;
    const { RENDER_LEAD_MINUTES, UPLOAD_LEAD_MINUTES } = await import("@/lib/render-pipeline.server");
    const { hasRenderCredentials } = await import("@/lib/render-settings.server");
    const serverRenderConfigured = await hasRenderCredentials(context.userId);

    const { data: campaign } = await supabase.from("campaigns").select("status").eq("id", data.campaignId).maybeSingle();
    const { data: rows } = await supabase
      .from("campaign_items")
      .select("id, video_file_name, seo_json, status, schedule_at, render_due_at, upload_due_at, render_provider, render_job_ref, render_submitted_at, rendered_video_url, youtube_publish_at, youtube_url, error_message")
      .eq("campaign_id", data.campaignId)
      .order("schedule_at", { ascending: true, nullsFirst: false })
      .limit(500);
    const { data: logs } = await supabase
      .from("automation_logs")
      .select("id, level, message, created_at")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(30);

    const items: AutomationItem[] = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      video_file_name: r.video_file_name ?? null,
      title: ((r.seo_json ?? {}) as { title?: string }).title ?? null,
      status: r.status,
      schedule_at: r.schedule_at ?? null,
      render_due_at: r.render_due_at ?? null,
      upload_due_at: r.upload_due_at ?? null,
      render_provider: r.render_provider ?? null,
      render_job_ref: r.render_job_ref ?? null,
      render_submitted_at: r.render_submitted_at ?? null,
      rendered_video_url: r.rendered_video_url ?? null,
      youtube_publish_at: r.youtube_publish_at ?? null,
      youtube_url: r.youtube_url ?? null,
      error_message: r.error_message ?? null,
    }));

    const counts = {
      total: items.length,
      waiting: items.filter((i) => !i.rendered_video_url && i.status !== "rendering" && i.status !== "failed").length,
      rendering: items.filter((i) => i.status === "rendering" || (!!i.render_job_ref && !i.rendered_video_url)).length,
      rendered: items.filter((i) => !!i.rendered_video_url && i.status === "rendered").length,
      scheduled: items.filter((i) => i.status === "scheduled").length,
      published: items.filter((i) => i.status === "uploaded").length,
      failed: items.filter((i) => i.status === "failed").length,
    };

    return {
      serverRenderConfigured,
      renderLeadMinutes: RENDER_LEAD_MINUTES,
      uploadLeadMinutes: UPLOAD_LEAD_MINUTES,
      campaignStatus: campaign?.status ?? null,
      counts,
      items,
      logs: (logs ?? []) as AutomationStatus["logs"],
    };
  });

/** Called right after a campaign is saved/activated: starts server rendering for
 *  the earliest videos immediately instead of waiting for the next lead time. */
export const kickCampaignAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<{ submitted: number; errors: number; skipped?: string }> => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns").select("id, user_id").eq("id", data.campaignId).single();
    if (error || !campaign || campaign.user_id !== context.userId) throw new Error("Campaign not found");
    const { submitDueRenders } = await import("@/lib/render-pipeline.server");
    return submitDueRenders({ campaignId: data.campaignId, ignoreLeadTime: true, limit: Math.min(data.limit ?? 2, 5) });
  });