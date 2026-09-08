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
  render_output_object_key: string | null;
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
  logs: Array<{ id: string; level: string; message: string; created_at: string; campaign_item_id: string | null; metadata_json: Record<string, unknown> }>;
};

/** Everything the automation view needs. All state lives in the database, so it
 *  keeps advancing (and stays accurate) with the browser tab closed. */
export const getAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }): Promise<AutomationStatus> => {
    const { supabase } = context;
    const { RENDER_LEAD_MINUTES, UPLOAD_LEAD_MINUTES } = await import("@/lib/render-pipeline.server");
    const { hasRenderCredentials } = await import("@/lib/render-settings.server");
    const serverRenderConfigured = await hasRenderCredentials(context.userId);

    const { data: campaign } = await supabase.from("campaigns").select("status").eq("id", data.campaignId).maybeSingle();
    const { data: rows } = await supabase
      .from("campaign_items")
      .select("id, video_file_name, seo_json, status, schedule_at, render_due_at, upload_due_at, render_provider, render_job_ref, render_submitted_at, rendered_video_url, render_output_object_key, youtube_publish_at, youtube_url, error_message")
      .eq("campaign_id", data.campaignId)
      .order("schedule_at", { ascending: true, nullsFirst: false })
      .limit(500);
    const { data: logs } = await supabase
      .from("automation_logs")
      .select("id, level, message, created_at, campaign_item_id, metadata_json")
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
      render_output_object_key: r.render_output_object_key ?? null,
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
  .validator((d: { campaignId: string; limit?: number }) => d)
  .handler(async ({ data, context }): Promise<{ submitted: number; errors: number; skipped?: string }> => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns").select("id, user_id").eq("id", data.campaignId).single();
    if (error || !campaign || campaign.user_id !== context.userId) throw new Error("Campaign not found");
    const { submitDueRenders } = await import("@/lib/render-pipeline.server");
    return submitDueRenders({ campaignId: data.campaignId, ignoreLeadTime: true, limit: Math.min(data.limit ?? 2, 5) });
  });
export const renderCampaignItemNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { campaignId: string; itemId: string; force?: boolean }) => d)
  .handler(async ({ data, context }): Promise<{ submitted: number; errors: number; skipped?: string }> => {
    const { data: item, error } = await context.supabase.from("campaign_items")
      .select("id,user_id,campaign_id,status,rendered_video_url,render_output_object_key,active_render_attempt_id,is_paused,youtube_video_id")
      .eq("id", data.itemId).eq("campaign_id", data.campaignId).single();
    if (error || !item) throw new Error("Campaign video not found");
    if ((item.rendered_video_url || item.render_output_object_key) && !data.force) return { submitted: 0, errors: 0, skipped: "MP4 already exists" };
    if (data.force && item.youtube_video_id) throw new Error("A video already published to YouTube cannot be replaced by manual re-render");
    if (item.active_render_attempt_id || item.status === "rendering") return { submitted: 0, errors: 0, skipped: "Render is already in progress" };
    if (["uploading","scheduled","uploaded"].includes(item.status)) throw new Error("This video is already in the YouTube upload stage");
    if (data.force && (item.rendered_video_url || item.render_output_object_key)) {
      const { error: resetError } = await context.supabase.from("campaign_items").update({
        rendered_video_url: null, render_output_object_key: null, status: "pending", error_message: null,
      }).eq("id", item.id);
      if (resetError) throw resetError;
    }
    const { submitDueRenders } = await import("@/lib/render-pipeline.server");
    return submitDueRenders({ campaignId: data.campaignId, itemId: data.itemId, ignoreLeadTime: true, allowInactiveCampaign: true, allowPausedItem: true, limit: 1 });
  });


export type ManualRenderStatus = {
  itemId: string;
  status: "idle" | "queued" | "rendering" | "completed" | "failed" | "cancelled";
  progress: number;
  ready: boolean;
  error: string | null;
  outputObjectKey: string | null;
};

/** Polls the authoritative native worker for one manually-triggered render and
 * finalizes its durable output immediately. This makes manual generation work
 * even when the background campaign cron is not currently running. */
export const getCampaignItemRenderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { campaignId: string; itemId: string }) => d)
  .handler(async ({ data, context }): Promise<ManualRenderStatus> => {
    const { data: item, error } = await context.supabase
      .from("campaign_items")
      .select("id,user_id,campaign_id,status,render_job_ref,active_render_attempt_id,rendered_video_url,render_output_object_key,error_message")
      .eq("id", data.itemId)
      .eq("campaign_id", data.campaignId)
      .single();
    if (error || !item) throw new Error("Campaign video not found");

    if (item.render_output_object_key || item.rendered_video_url) {
      return { itemId: item.id, status: "completed", progress: 100, ready: true, error: null, outputObjectKey: item.render_output_object_key ?? null };
    }
    if (!item.render_job_ref) {
      return { itemId: item.id, status: item.status === "failed" ? "failed" : "idle", progress: 0, ready: false, error: item.error_message ?? null, outputObjectKey: null };
    }

    const { getRenderWorkerConfig } = await import("@/lib/render-settings.server");
    const { getFfmpegWorkerJob } = await import("@/lib/ffmpeg-worker.server");
    const { finalizeR2Render, storeFinishedRender } = await import("@/lib/render-pipeline.server");
    const config = await getRenderWorkerConfig(item.user_id);
    if (!config) throw new Error("Native render worker is not configured");
    const worker = await getFfmpegWorkerJob(config, item.render_job_ref);
    const progress = Math.max(0, Math.min(100, Math.round(Number(worker.progress ?? 0))));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (item.active_render_attempt_id) {
      await (supabaseAdmin as any).from("render_attempts").update({
        provider_status: worker.status,
        progress_percent: progress,
        progress_updated_at: new Date().toISOString(),
      }).eq("id", item.active_render_attempt_id);
    }

    if (worker.status === "completed") {
      const ref = { id: item.id, user_id: item.user_id, campaign_id: item.campaign_id, active_render_attempt_id: item.active_render_attempt_id };
      if (worker.outputObjectKey) await finalizeR2Render(ref, worker.outputObjectKey, item.active_render_attempt_id);
      else if (worker.outputUrl) await storeFinishedRender(ref, worker.outputUrl, item.active_render_attempt_id);
      else throw new Error("Renderer completed without an MP4 output");
      return { itemId: item.id, status: "completed", progress: 100, ready: true, error: null, outputObjectKey: worker.outputObjectKey ?? null };
    }

    return {
      itemId: item.id,
      status: worker.status === "queued" ? "queued" : worker.status,
      progress,
      ready: false,
      error: worker.error ?? item.error_message ?? null,
      outputObjectKey: null,
    };
  });

function safeMp4Name(value: string | null | undefined, itemId: string) {
  const base = String(value || `video-${itemId.slice(0, 8)}`).replace(/\.mp4$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || `video-${itemId.slice(0, 8)}`;
  return `${base}.mp4`;
}

/** Returns a short-lived, authenticated download target for a completed MP4.
 * R2 objects are never made public and infrastructure credentials stay server-side. */
export const getCampaignItemRenderDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { campaignId: string; itemId: string }) => d)
  .handler(async ({ data, context }): Promise<{ url: string; fileName: string }> => {
    const { data: item, error } = await context.supabase
      .from("campaign_items")
      .select("id,campaign_id,video_file_name,rendered_video_url,render_output_object_key")
      .eq("id", data.itemId)
      .eq("campaign_id", data.campaignId)
      .single();
    if (error || !item) throw new Error("Campaign video not found");
    const fileName = safeMp4Name(item.video_file_name, item.id);
    const key = item.render_output_object_key || (item.rendered_video_url?.startsWith("r2://") ? item.rendered_video_url.slice(5) : null);
    if (key) {
      const { presignR2Get } = await import("@/lib/r2-publish-source.server");
      return { url: await presignR2Get(key, 900, process.env, fileName), fileName };
    }
    if (item.rendered_video_url && !/^https?:\/\//i.test(item.rendered_video_url)) {
      const clean = item.rendered_video_url.replace(/^renders\//, "").replace(/^\/+/, "");
      const { data: signed, error: signError } = await context.supabase.storage.from("renders").createSignedUrl(clean, 900, { download: fileName });
      if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not create MP4 download URL");
      return { url: signed.signedUrl, fileName };
    }
    throw new Error("This render does not have a durable downloadable MP4 yet");
  });
