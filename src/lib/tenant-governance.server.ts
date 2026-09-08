export type TenantCapacityPolicy = {
  planKey: string;
  weight: number;
  maxConcurrentRenders: number;
  maxConcurrentPublishes: number;
  renderDailyLimit: number;
  renderMonthlyLimit: number;
  renderDailyBudgetUsd: number;
  renderMonthlyBudgetUsd: number;
  youtubeDailyUploadLimit: number;
  youtubeDailyQuotaUnits: number;
  renderSubmissionsPerMinute: number;
  scheduledReserveMinutes: number;
  r2JobRetentionDays: number;
  r2OutputRetentionDays: number;
};

export async function getTenantCapacityPolicy(userId: string): Promise<TenantCapacityPolicy> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("phase10_policy", { p_user_id: userId });
  if (error) throw new Error(error.message || "Could not load tenant capacity policy");
  return data as TenantCapacityPolicy;
}

function dayStartIso() { const d = new Date(); d.setUTCHours(0,0,0,0); return d.toISOString(); }
function monthStartIso() { const d = new Date(); d.setUTCDate(1); d.setUTCHours(0,0,0,0); return d.toISOString(); }

export async function assertRenderGovernance(userId: string, estimatedCostUsd: number, referenceId?: string): Promise<TenantCapacityPolicy> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const policy = await getTenantCapacityPolicy(userId);
  const admission = await (supabaseAdmin as any).rpc("phase10_consume_tenant_admission", { p_user_id: userId, p_kind: "render" });
  if (admission.error) throw new Error(admission.error.message || "Could not evaluate tenant backpressure");
  if (admission.data?.allowed === false) throw new Error(`Tenant backpressure: ${admission.data.reason ?? "rate limited"}; retry after ${admission.data.retryAfterSeconds ?? 30}s`);
  const { data, error } = await (supabaseAdmin as any).from("capacity_usage_events")
    .select("event_type,cost_usd,created_at")
    .eq("user_id", userId)
    .in("event_type", ["render_submitted","render_completed"])
    .gte("created_at", monthStartIso());
  if (error) throw new Error(error.message || "Could not read tenant render usage");
  const rows = (data ?? []) as Array<{event_type:string;cost_usd:number|string;created_at:string}>;
  const today = dayStartIso();
  const monthlyRenders = rows.filter(r => r.event_type === "render_submitted").length;
  const dailyRenders = rows.filter(r => r.event_type === "render_submitted" && r.created_at >= today).length;
  const monthlyCost = rows.filter(r => r.event_type === "render_submitted").reduce((n,r)=>n+Number(r.cost_usd||0),0);
  const dailyCost = rows.filter(r => r.event_type === "render_submitted" && r.created_at >= today).reduce((n,r)=>n+Number(r.cost_usd||0),0);
  const blocked = dailyRenders >= policy.renderDailyLimit || monthlyRenders >= policy.renderMonthlyLimit || dailyCost + estimatedCostUsd > policy.renderDailyBudgetUsd || monthlyCost + estimatedCostUsd > policy.renderMonthlyBudgetUsd;
  if (blocked && referenceId) {
    const over = await (supabaseAdmin as any).rpc("phase11_authorize_render_overage", { p_user_id: userId, p_reference_id: referenceId, p_estimated_cost_usd: estimatedCostUsd });
    if (!over.error && over.data?.allowed) return policy;
  }
  if (dailyRenders >= policy.renderDailyLimit) throw new Error(`Plan render limit reached: ${dailyRenders}/${policy.renderDailyLimit} today`);
  if (monthlyRenders >= policy.renderMonthlyLimit) throw new Error(`Plan render limit reached: ${monthlyRenders}/${policy.renderMonthlyLimit} this month`);
  if (dailyCost + estimatedCostUsd > policy.renderDailyBudgetUsd) throw new Error(`Daily render budget would be exceeded ($${dailyCost.toFixed(2)}/$${policy.renderDailyBudgetUsd.toFixed(2)})`);
  if (monthlyCost + estimatedCostUsd > policy.renderMonthlyBudgetUsd) throw new Error(`Monthly render budget would be exceeded ($${monthlyCost.toFixed(2)}/$${policy.renderMonthlyBudgetUsd.toFixed(2)})`);
  return policy;
}

export async function recordCapacityUsage(input:{userId:string;eventType:string;units?:number;costUsd?:number;referenceType?:string;referenceId?:string;metadata?:Record<string,unknown>}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).rpc("phase10_record_usage", {
    p_user_id: input.userId, p_event_type: input.eventType, p_units: input.units ?? 1, p_cost_usd: input.costUsd ?? 0,
    p_reference_type: input.referenceType ?? null, p_reference_id: input.referenceId ?? null, p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message || "Could not record capacity usage");
}

export async function reserveYouTubeQuota(publishJobId:string):Promise<{allowed:boolean;alreadyReserved?:boolean;[key:string]:unknown}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const estimated = Math.max(1, Number(process.env.YOUTUBE_ESTIMATED_UPLOAD_QUOTA_UNITS ?? 1600));
  const { data, error } = await (supabaseAdmin as any).rpc("phase10_reserve_youtube_quota", { p_publish_job_id: publishJobId, p_estimated_units: estimated });
  if (error) throw new Error(error.message || "Could not reserve YouTube quota");
  return data as any;
}

export async function getGovernanceHealth():Promise<Record<string,unknown>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("phase10_governance_health");
  if (error) throw new Error(error.message || "Could not read governance health");
  return (data ?? {}) as Record<string,unknown>;
}

export async function resolveGovernanceSubject(userId:string, organizationId?:string|null):Promise<{subjectUserId:string;tenantId:string}> {
  if(!organizationId) return {subjectUserId:userId,tenantId:userId};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("organizations").select("billing_owner_user_id").eq("id",organizationId).maybeSingle();
  return {subjectUserId:data?.billing_owner_user_id ?? userId, tenantId:organizationId};
}
