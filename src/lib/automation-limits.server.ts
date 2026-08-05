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

/** In-flight renders: claimed rows that have no stored MP4 yet. */
export async function inFlightRenders(): Promise<{ total: number; perUser: Record<string, number> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("campaign_items")
    .select("user_id")
    .is("rendered_video_url", null)
    .or("status.eq.rendering,render_job_ref.not.is.null")
    .limit(500);
  const perUser: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ user_id: string }>) perUser[r.user_id] = (perUser[r.user_id] ?? 0) + 1;
  return { total: (data ?? []).length, perUser };
}

export async function inFlightUploads(): Promise<{ total: number; perUser: Record<string, number> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("campaign_items").select("user_id").eq("status", "uploading").limit(500);
  const perUser: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ user_id: string }>) perUser[r.user_id] = (perUser[r.user_id] ?? 0) + 1;
  return { total: (data ?? []).length, perUser };
}
