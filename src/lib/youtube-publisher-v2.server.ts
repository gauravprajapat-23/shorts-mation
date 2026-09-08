import { hostname } from "node:os";
import { uploadItemToYouTube } from "@/lib/youtube-upload.functions";
import { reserveYouTubeQuota, recordCapacityUsage } from "@/lib/tenant-governance.server";

const PUBLISHER_VERSION = "publisher-v8";
const PUBLISHER_NODE_ID = process.env.PUBLISH_WORKER_ID || `publisher:${hostname()}:${process.pid}`;

type PublishJob = {
  id: string;
  campaign_item_id: string;
  user_id: string;
  intended_publish_at: string | null;
  attempt_count: number;
  max_attempts: number;
};

function retryDelayMs(attempt: number, quota: boolean): number {
  if (quota) return 60 * 60 * 1000;
  const base = Math.min(30 * 60_000, 15_000 * 2 ** Math.max(0, attempt - 1));
  return base + Math.floor(Math.random() * 5_000);
}

function isQuotaError(message: string): boolean {
  return /quota|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded|TENANT_YOUTUBE_QUOTA/i.test(message);
}


async function reconcileScheduledPublishes(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getFreshYouTubeAccessTokenForIntelligence } = await import("@/lib/youtube-upload.functions");
  const nowIso = new Date().toISOString();
  const { data: rows } = await supabaseAdmin.from("campaign_items")
    .select("id,user_id,youtube_video_id,youtube_publish_at,campaigns!inner(youtube_connection_id)")
    .eq("status", "scheduled").not("youtube_video_id", "is", null).not("youtube_publish_at", "is", null)
    .lte("youtube_publish_at", nowIso).limit(30);
  let reconciled = 0;
  for (const row of (rows ?? []) as any[]) {
    try {
      const connectionId = row.campaigns?.youtube_connection_id as string | undefined;
      if (!connectionId) continue;
      const { data: conn } = await supabaseAdmin.from("youtube_connections").select("*").eq("id", connectionId).eq("user_id", row.user_id).single();
      if (!conn) continue;
      const token = await getFreshYouTubeAccessTokenForIntelligence(conn as any);
      const check = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(row.youtube_video_id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!check.ok) continue;
      const body = await check.json() as { items?: Array<{ status?: { privacyStatus?: string } }> };
      if (body.items?.[0]?.status?.privacyStatus === "public") {
        await supabaseAdmin.from("campaign_items").update({ status: "uploaded", error_message: null }).eq("id", row.id).eq("status", "scheduled");
        reconciled++;
      }
    } catch { /* durable next tick reconciliation */ }
  }
  try { await (supabaseAdmin as any).rpc("complete_finished_campaigns"); } catch {}
  return reconciled;
}

export async function processPublishQueue(opts?: { faultCheckpoint?: string; faultCampaignItemId?: string }): Promise<{ claimed: number; completed: number; retried: number; failed: number; staleRecovered: number; scheduledReconciled: number; draining: boolean; workerId: string; fleet: unknown }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const workerId = PUBLISHER_NODE_ID;
  const draining = process.env.PUBLISH_DRAINING === "1";
  const maxConcurrency = Math.max(1, Math.min(10, Number(process.env.PUBLISH_JOBS_PER_TICK ?? 2)));
  await (supabaseAdmin as any).from("publisher_nodes").upsert({ worker_id: workerId, hostname: hostname(), status: draining ? "draining" : "active", active_jobs: 0, max_concurrency: maxConcurrency, version: PUBLISHER_VERSION, last_heartbeat_at: new Date().toISOString(), metadata_json: { direct_r2: true } }, { onConflict: "worker_id" });
  if (draining) {
    const fleet = await (supabaseAdmin as any).rpc("publisher_fleet_health", { p_stale_seconds: 60 });
    return { claimed: 0, completed: 0, retried: 0, failed: 0, staleRecovered: 0, scheduledReconciled: 0, draining: true, workerId, fleet: fleet.data ?? null };
  }
  const leaseSeconds = Math.max(60, Number(process.env.PUBLISH_LEASE_SECONDS ?? 180));
  const limit = maxConcurrency;
  const stale = await (supabaseAdmin as any).rpc("reconcile_stale_publish_jobs");
  const staleRecovered = Number(stale.data ?? 0);
  const claim = await (supabaseAdmin as any).rpc("claim_publish_jobs", { p_worker_id: workerId, p_limit: limit, p_lease_seconds: leaseSeconds });
  if (claim.error) throw new Error(claim.error.message || "Could not claim publish jobs");
  const jobs = (claim.data ?? []) as PublishJob[];
  await (supabaseAdmin as any).from("publisher_nodes").update({ active_jobs: jobs.length, last_heartbeat_at: new Date().toISOString(), status: "active" }).eq("worker_id", workerId);
  let completed = 0, retried = 0, failed = 0;

  for (const job of jobs) {
    const heartbeat = async () => {
      const hb = await (supabaseAdmin as any).rpc("heartbeat_publish_job", { p_job_id: job.id, p_worker_id: workerId, p_lease_seconds: leaseSeconds });
      if (hb.error || hb.data !== true) throw new Error("Publish lease lost");
      await (supabaseAdmin as any).from("publisher_nodes").update({ last_heartbeat_at: new Date().toISOString() }).eq("worker_id", workerId);
    };
    try {
      await heartbeat();
      const quotaReservation = await reserveYouTubeQuota(job.id);
      if (!quotaReservation.allowed) throw new Error(`TENANT_YOUTUBE_QUOTA:${JSON.stringify(quotaReservation)}`);
      await (supabaseAdmin as any).from("publish_jobs").update({ status: "uploading", updated_at: new Date().toISOString() }).eq("id", job.id).eq("lease_owner", workerId);
      const publishAt = job.intended_publish_at && new Date(job.intended_publish_at).getTime() > Date.now() + 60_000 ? job.intended_publish_at : null;
      const result = await uploadItemToYouTube(job.campaign_item_id, {
        publishAt,
        durableRetry: true,
        onProgress: async () => { await heartbeat(); },
        onCheckpoint: async (checkpoint, data = {}) => {
          const patch: Record<string, unknown> = { external_commit_checkpoint: checkpoint, updated_at: new Date().toISOString() };
          if (typeof data.uploadUrl === "string") patch.upload_session_url = data.uploadUrl;
          if (typeof data.uploadOffset === "number") patch.upload_offset = data.uploadOffset;
          if (typeof data.uploadLength === "number") patch.upload_length = data.uploadLength;
          if (typeof data.sourceObjectKey === "string") patch.source_object_key = data.sourceObjectKey;
          if (typeof data.youtubeVideoId === "string") patch.youtube_video_id = data.youtubeVideoId;
          await (supabaseAdmin as any).from("publish_jobs").update(patch).eq("id", job.id).eq("lease_owner", workerId);
          await heartbeat();
          const drill = process.env.ALLOW_PUBLISH_FAULT_INJECTION === "1" ? (opts?.faultCheckpoint ?? process.env.PUBLISH_CRASH_AFTER_CHECKPOINT) : undefined;
          const drillItemMatches = !opts?.faultCampaignItemId || opts.faultCampaignItemId === job.campaign_item_id;
          if (drill && drillItemMatches && drill === checkpoint) throw new Error(`PHASE8_CRASH_DRILL:${checkpoint}`);
        },
      });
      await (supabaseAdmin as any).from("publish_jobs").update({
        status: "completed", youtube_video_id: result.videoId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        lease_owner: null, lease_expires_at: null, heartbeat_at: null, last_error: null,
      }).eq("id", job.id).eq("lease_owner", workerId);
      try { await recordCapacityUsage({ userId: (job as any).user_id, eventType: "publish_completed", referenceType: "publish_job", referenceId: job.id, metadata: { youtubeVideoId: result.videoId } }); } catch {}
      completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const quota = isQuotaError(message);
      const tenantQuota = message.includes("TENANT_YOUTUBE_QUOTA");
      const terminal = job.attempt_count >= job.max_attempts && !quota;
      const nextAttempt = tenantQuota
        ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 0, 5)).toISOString()
        : new Date(Date.now() + retryDelayMs(job.attempt_count, quota)).toISOString();
      await (supabaseAdmin as any).from("publish_jobs").update({
        status: terminal ? "failed" : "retry_wait", next_attempt_at: nextAttempt,
        lease_owner: null, lease_expires_at: null, heartbeat_at: null,
        last_error: message, quota_error: quota, updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("lease_owner", workerId);
      if (terminal) failed++; else retried++;
    }
  }
  const scheduledReconciled = await reconcileScheduledPublishes();
  await (supabaseAdmin as any).from("publisher_nodes").update({ active_jobs: 0, last_heartbeat_at: new Date().toISOString(), status: "active" }).eq("worker_id", workerId);
  const fleetResult = await (supabaseAdmin as any).rpc("publisher_fleet_health", { p_stale_seconds: 60 });
  return { claimed: jobs.length, completed, retried, failed, staleRecovered, scheduledReconciled, draining: false, workerId, fleet: fleetResult.data ?? null };
}

export async function getPublisherFleetHealth(): Promise<unknown> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await (supabaseAdmin as any).rpc("publisher_fleet_health", { p_stale_seconds: 60 });
  if (result.error) throw new Error(result.error.message || "Could not read publisher fleet health");
  return result.data ?? null;
}
