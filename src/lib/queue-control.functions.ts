import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScheduleUpdate } from "@/lib/schedule-bulk";

export type QueueAttempt = {
  id: string;
  kind: "render" | "upload";
  status: string;
  claimed_at: string;
  started_at: string | null;
  finished_at: string | null;
  provider_ref: string | null;
  error_message: string | null;
};

export type QueueItemDetail = {
  attempts: QueueAttempt[];
};

export const retryQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("retry_campaign_item", { p_item_id: data.itemId });
    if (error) throw new Error(error.message);
    const result = row?.[0];
    if (!result) throw new Error("Item could not be retried");
    return { stage: result.retry_stage as "render" | "upload", retryCount: Number(result.retry_count) };
  });

export const bulkUpdateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; updates: ScheduleUpdate[] }) => d)
  .handler(async ({ data, context }) => {
    if (!Array.isArray(data.updates) || data.updates.length > 1000) throw new Error("Invalid bulk update");
    const clean = data.updates.map((u) => ({
      id: String(u.id),
      schedule_at: u.schedule_at ?? null,
      ...(u.privacy ? { privacy: u.privacy } : {}),
    }));
    const { data: count, error } = await (context.supabase as any).rpc("bulk_update_queue_items", {
      p_campaign_id: data.campaignId,
      p_updates: clean,
    });
    if (error) throw new Error(error.message);
    return { updated: Number(count ?? 0) };
  });

async function ownedItem(context: any, itemId: string) {
  const { data: item, error } = await context.supabase
    .from("campaign_items")
    .select("id,user_id,campaign_id,status,schedule_at,youtube_video_id,youtube_publish_at,youtube_settings_json,active_upload_attempt_id")
    .eq("id", itemId)
    .single();
  if (error || !item || item.user_id !== context.userId) throw new Error("Queue item not found");
  return item as any;
}

async function youtubeAccessForItem(item: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("youtube_connection_id,user_id")
    .eq("id", item.campaign_id)
    .single();
  if (!campaign?.youtube_connection_id || campaign.user_id !== item.user_id) throw new Error("YouTube channel is not connected");
  const { data: conn } = await supabaseAdmin.from("youtube_connections").select("*").eq("id", campaign.youtube_connection_id).single();
  if (!conn) throw new Error("YouTube connection not found");
  const { getFreshYouTubeAccessToken } = await import("@/lib/youtube-upload.functions");
  return { supabaseAdmin, token: await getFreshYouTubeAccessToken(conn as any) };
}

export const updateQueueItemSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; scheduleAt: string | null; privacy?: "private" | "unlisted" | "public" }) => d)
  .handler(async ({ data, context }) => {
    const item = await ownedItem(context, data.itemId);
    if (item.status === "uploading" || item.active_upload_attempt_id) throw new Error("This video is currently uploading and cannot be changed.");
    const nextIso = data.scheduleAt ? new Date(data.scheduleAt).toISOString() : null;

    // Pre-YouTube rows are updated through the transactional queue RPC.
    if (!item.youtube_video_id) {
      const { data: count, error } = await (context.supabase as any).rpc("bulk_update_queue_items", {
        p_campaign_id: item.campaign_id,
        p_updates: [{ id: item.id, schedule_at: nextIso, ...(data.privacy ? { privacy: data.privacy } : {}) }],
      });
      if (error) throw new Error(error.message);
      return { updated: Number(count ?? 0), synchronized: false };
    }

    if (item.status !== "scheduled") throw new Error("Published videos are locked in Queue. Manage them directly on YouTube.");
    if (!nextIso) throw new Error("A YouTube-scheduled video must keep a publish time. Use YouTube Studio to cancel publication.");
    if (new Date(nextIso).getTime() <= Date.now() + 60_000) throw new Error("YouTube publish time must be at least one minute in the future.");

    const { supabaseAdmin, token } = await youtubeAccessForItem(item);
    const privacy = data.privacy ?? ((item.youtube_settings_json ?? {}) as { privacy?: "private" | "unlisted" | "public" }).privacy ?? "private";
    // YouTube scheduled publication requires private + publishAt. `privacy` is
    // retained as the post-schedule preference in our row, but remote status
    // remains private until YouTube publishes it.
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.youtube_video_id, status: { privacyStatus: "private", publishAt: nextIso, selfDeclaredMadeForKids: false } }),
    });
    if (!res.ok) throw new Error(`YouTube reschedule failed: ${res.status} ${await res.text()}`);

    const settings = { ...(item.youtube_settings_json ?? {}), privacy };
    const { error } = await supabaseAdmin.from("campaign_items").update({
      schedule_at: nextIso,
      youtube_publish_at: nextIso,
      youtube_settings_json: settings,
      error_message: null,
    }).eq("id", item.id).eq("user_id", context.userId).eq("status", "scheduled");
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("automation_logs").insert({
      user_id: context.userId,
      campaign_id: item.campaign_id,
      campaign_item_id: item.id,
      level: "info",
      message: `YouTube schedule synchronized to ${nextIso}`,
      metadata_json: { youtube_video_id: item.youtube_video_id, schedule_at: nextIso } as never,
    });
    return { updated: 1, synchronized: true };
  });

export const updateQueueItemPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; privacy: "private" | "unlisted" | "public" }) => d)
  .handler(async ({ data, context }) => {
    const item = await ownedItem(context, data.itemId);
    if (item.status === "uploading" || item.active_upload_attempt_id) throw new Error("This video is currently uploading and cannot be changed.");
    if (item.status === "scheduled") throw new Error("A scheduled video must remain private until YouTube publishes it. Change its publish time instead.");
    if (!item.youtube_video_id) {
      const { data: count, error } = await (context.supabase as any).rpc("bulk_update_queue_items", {
        p_campaign_id: item.campaign_id,
        p_updates: [{ id: item.id, schedule_at: item.schedule_at, privacy: data.privacy }],
      });
      if (error) throw new Error(error.message);
      return { updated: Number(count ?? 0), synchronized: false };
    }
    const { supabaseAdmin, token } = await youtubeAccessForItem(item);
    const res = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.youtube_video_id, status: { privacyStatus: data.privacy, selfDeclaredMadeForKids: false } }),
    });
    if (!res.ok) throw new Error(`YouTube privacy update failed: ${res.status} ${await res.text()}`);
    const settings = { ...(item.youtube_settings_json ?? {}), privacy: data.privacy };
    const { error } = await supabaseAdmin.from("campaign_items").update({ youtube_settings_json: settings, error_message: null }).eq("id", item.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("automation_logs").insert({ user_id: context.userId, campaign_id: item.campaign_id, campaign_item_id: item.id, level: "info", message: `YouTube privacy synchronized to ${data.privacy}`, metadata_json: { privacy: data.privacy } as never });
    return { updated: 1, synchronized: true };
  });

export const getQueueItemDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data, context }): Promise<QueueItemDetail> => {
    await ownedItem(context, data.itemId);
    const [renders, uploads] = await Promise.all([
      (context.supabase as any).from("render_attempts").select("id,status,claimed_at,submitted_at,finished_at,provider_job_ref,error_message").eq("campaign_item_id", data.itemId).order("claimed_at", { ascending: false }).limit(20),
      (context.supabase as any).from("upload_attempts").select("id,status,claimed_at,started_at,finished_at,provider_upload_ref,youtube_video_id,error_message").eq("campaign_item_id", data.itemId).order("claimed_at", { ascending: false }).limit(20),
    ]);
    const attempts: QueueAttempt[] = [
      ...((renders.data ?? []) as any[]).map((a) => ({ id:a.id, kind:"render" as const, status:a.status, claimed_at:a.claimed_at, started_at:a.submitted_at ?? null, finished_at:a.finished_at ?? null, provider_ref:a.provider_job_ref ?? null, error_message:a.error_message ?? null })),
      ...((uploads.data ?? []) as any[]).map((a) => ({ id:a.id, kind:"upload" as const, status:a.status, claimed_at:a.claimed_at, started_at:a.started_at ?? null, finished_at:a.finished_at ?? null, provider_ref:a.youtube_video_id ?? a.provider_upload_ref ?? null, error_message:a.error_message ?? null })),
    ].sort((a,b) => new Date(b.claimed_at).getTime() - new Date(a.claimed_at).getTime());
    return { attempts };
  });
