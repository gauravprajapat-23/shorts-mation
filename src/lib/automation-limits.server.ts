// Database-driven throttling so server rendering and uploads never spike, even
// when many videos share the same publish window.
export type AutomationLimits = {
  max_global_concurrent_renders: number;
  max_user_concurrent_renders: number;
  max_renders_per_tick: number;
  max_global_concurrent_uploads: number;
  max_user_concurrent_uploads: number;
  max_uploads_per_tick: number;
};

const DEFAULTS: AutomationLimits = {
  max_global_concurrent_renders: 6,
  max_user_concurrent_renders: 2,
  max_renders_per_tick: 3,
  max_global_concurrent_uploads: 4,
  max_user_concurrent_uploads: 1,
  max_uploads_per_tick: 6,
};

export async function getAutomationLimits(): Promise<AutomationLimits> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("automation_limits").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULTS, ...((data ?? {}) as Partial<AutomationLimits>) };
}

export type UserLimitOverride = {
  max_concurrent_renders: number | null;
  max_concurrent_uploads: number | null;
  note: string | null;
};

/** Per-account overrides so single accounts can be boosted or throttled
 *  without touching the global caps (or redeploying). */
export async function getUserLimitOverrides(): Promise<Record<string, UserLimitOverride>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("automation_user_limits")
    .select("user_id, max_concurrent_renders, max_concurrent_uploads, note")
    .limit(2000);
  const map: Record<string, UserLimitOverride> = {};
  for (const r of (data ?? []) as Array<{ user_id: string } & UserLimitOverride>) {
    map[r.user_id] = {
      max_concurrent_renders: r.max_concurrent_renders,
      max_concurrent_uploads: r.max_concurrent_uploads,
      note: r.note,
    };
  }
  return map;
}

/** Effective per-user cap: the override when set, otherwise the global default. */
export function effectiveCap(
  overrides: Record<string, UserLimitOverride>,
  userId: string,
  kind: "renders" | "uploads",
  fallback: number,
): number {
  const o = overrides[userId];
  const v = kind === "renders" ? o?.max_concurrent_renders : o?.max_concurrent_uploads;
  return typeof v === "number" ? v : fallback;
}

/** How long a claimed render may stay unfinished before it stops counting
 *  against the concurrency caps (and becomes reclaimable). */
export const RENDER_STALE_MINUTES = 30;

/** In-flight renders: recently claimed rows that have no stored MP4 yet.
 *  Abandoned claims (e.g. a browser tab closed mid-render) are excluded so a
 *  handful of stuck rows can never block the whole queue forever. */
export async function inFlightRenders(): Promise<{ total: number; perUser: Record<string, number> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - RENDER_STALE_MINUTES * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("campaign_items")
    .select("user_id, status, render_job_ref, render_submitted_at, updated_at")
    .is("rendered_video_url", null)
    .or("status.eq.rendering,render_job_ref.not.is.null")
    .limit(500);
  const fresh = ((data ?? []) as Array<{
    user_id: string;
    render_job_ref: string | null;
    render_submitted_at: string | null;
    updated_at: string | null;
  }>).filter((r) => (r.render_submitted_at ?? r.updated_at ?? "") > cutoff);
  const perUser: Record<string, number> = {};
  for (const r of fresh) perUser[r.user_id] = (perUser[r.user_id] ?? 0) + 1;
  return { total: fresh.length, perUser };
}

export async function inFlightUploads(): Promise<{ total: number; perUser: Record<string, number> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("campaign_items").select("user_id").eq("status", "uploading").limit(500);
  const perUser: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ user_id: string }>) perUser[r.user_id] = (perUser[r.user_id] ?? 0) + 1;
  return { total: (data ?? []).length, perUser };
}
