import { randomUUID } from "node:crypto";

export type SchedulerDispatchResult = {
  runId: string | null;
  renderCandidates: number;
  publishCandidates: number;
  leaderAcquired: boolean;
};

/**
 * Durable scheduler pass. campaign_items already contain the materialized video
 * payload; this stage turns their publish schedule into durable render/upload
 * deadlines and one exactly-once publish_jobs row per item.
 */
export async function dispatchUpcomingCampaignItems(horizonMinutes = 24 * 60): Promise<SchedulerDispatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const workerId = `scheduler:${process.pid}:${randomUUID()}`;
  const { data: run } = await (supabaseAdmin as any).from("scheduler_runs").insert({ worker_id: workerId }).select("id").maybeSingle();
  const runId = (run?.id as string | undefined) ?? null;
  try {
    const { data, error } = await (supabaseAdmin as any).rpc("phase8_dispatch_campaign_scheduler", { p_worker_id: workerId, p_horizon_minutes: horizonMinutes });
    if (error) throw new Error(error.message || "Campaign dispatch failed");
    const row = data?.[0] as { leader_acquired?: boolean; render_candidates?: number; publish_candidates?: number } | undefined;
    const result = {
      runId,
      renderCandidates: Number(row?.render_candidates ?? 0),
      publishCandidates: Number(row?.publish_candidates ?? 0),
      leaderAcquired: Boolean(row?.leader_acquired),
    };
    if (runId) await (supabaseAdmin as any).from("scheduler_runs").update({
      finished_at: new Date().toISOString(), render_candidates: result.renderCandidates, publish_candidates: result.publishCandidates,
    }).eq("id", runId);
    return result;
  } catch (error) {
    if (runId) await (supabaseAdmin as any).from("scheduler_runs").update({
      finished_at: new Date().toISOString(), metadata_json: { error: error instanceof Error ? error.message : String(error) },
    }).eq("id", runId);
    throw error;
  }
}
