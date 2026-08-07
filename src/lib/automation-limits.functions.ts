import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountLimitRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  maxConcurrentRenders: number | null;
  maxConcurrentUploads: number | null;
  note: string | null;
  inFlightRenders: number;
  inFlightUploads: number;
};

export type LimitControls = {
  isAdmin: boolean;
  globals: {
    maxGlobalConcurrentRenders: number;
    maxUserConcurrentRenders: number;
    maxRendersPerTick: number;
    maxGlobalConcurrentUploads: number;
    maxUserConcurrentUploads: number;
    maxUploadsPerTick: number;
  };
  self: AccountLimitRow;
  accounts: AccountLimitRow[];
};

const MAX_CAP = 50;

async function isAdmin(supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

/** Global caps + per-account overrides. Admins see every account; everyone else
 *  sees (and can only tighten) their own account. */
export const getAutomationLimitControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LimitControls> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAutomationLimits, getUserLimitOverrides, inFlightRenders, inFlightUploads } = await import(
      "@/lib/automation-limits.server"
    );
    const admin = await isAdmin(context.supabase as never, context.userId);
    const [limits, overrides, renders, uploads] = await Promise.all([
      getAutomationLimits(),
      getUserLimitOverrides(),
      inFlightRenders(),
      inFlightUploads(),
    ]);

    const globals = {
      maxGlobalConcurrentRenders: limits.max_global_concurrent_renders,
      maxUserConcurrentRenders: limits.max_user_concurrent_renders,
      maxRendersPerTick: limits.max_renders_per_tick,
      maxGlobalConcurrentUploads: limits.max_global_concurrent_uploads,
      maxUserConcurrentUploads: limits.max_user_concurrent_uploads,
      maxUploadsPerTick: limits.max_uploads_per_tick,
    };

    const row = (userId: string, email: string | null, fullName: string | null): AccountLimitRow => ({
      userId,
      email,
      fullName,
      maxConcurrentRenders: overrides[userId]?.max_concurrent_renders ?? null,
      maxConcurrentUploads: overrides[userId]?.max_concurrent_uploads ?? null,
      note: overrides[userId]?.note ?? null,
      inFlightRenders: renders.perUser[userId] ?? 0,
      inFlightUploads: uploads.perUser[userId] ?? 0,
    });

    const { data: me } = await context.supabase
      .from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle();
    const self = row(context.userId, me?.email ?? null, me?.full_name ?? null);

    if (!admin) return { isAdmin: false, globals, self, accounts: [self] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, email, full_name").order("created_at", { ascending: true }).limit(500);
    const accounts = ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map((p) =>
      row(p.id, p.email, p.full_name),
    );
    return { isAdmin: true, globals, self, accounts };
  });

/** Upsert one account's override. Non-admins may only tighten their own account. */
export const saveAutomationUserLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId?: string;
    maxConcurrentRenders: number | null;
    maxConcurrentUploads: number | null;
    note?: string | null;
  }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAutomationLimits } = await import("@/lib/automation-limits.server");
    const admin = await isAdmin(context.supabase as never, context.userId);
    const targetId = data.userId ?? context.userId;
    if (targetId !== context.userId && !admin) return { ok: false, error: "Only admins can change another account." };

    const limits = await getAutomationLimits();
    const clean = (v: number | null, selfMax: number) => {
      if (v === null || v === undefined || Number.isNaN(v)) return null;
      const n = Math.floor(v);
      if (n < 0) return 0;
      const ceiling = admin ? MAX_CAP : selfMax;
      return Math.min(n, ceiling);
    };

    const { error } = await supabaseAdmin.from("automation_user_limits").upsert(
      {
        user_id: targetId,
        max_concurrent_renders: clean(data.maxConcurrentRenders, limits.max_user_concurrent_renders),
        max_concurrent_uploads: clean(data.maxConcurrentUploads, limits.max_user_concurrent_uploads),
        note: (data.note ?? "").trim().slice(0, 240) || null,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/** Back to the global defaults for that account. */
export const clearAutomationUserLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = await isAdmin(context.supabase as never, context.userId);
    const targetId = data.userId ?? context.userId;
    if (targetId !== context.userId && !admin) return { ok: false, error: "Only admins can change another account." };
    await supabaseAdmin.from("automation_user_limits").delete().eq("user_id", targetId);
    return { ok: true };
  });

/** Admin-only: the global ceilings every account is measured against. */
export const saveAutomationGlobalLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    maxGlobalConcurrentRenders: number;
    maxUserConcurrentRenders: number;
    maxRendersPerTick: number;
    maxGlobalConcurrentUploads: number;
    maxUserConcurrentUploads: number;
    maxUploadsPerTick: number;
  }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const admin = await isAdmin(context.supabase as never, context.userId);
    if (!admin) return { ok: false, error: "Admins only." };
    const n = (v: number, min = 0) => Math.max(min, Math.min(MAX_CAP, Math.floor(Number(v) || 0)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("automation_limits")
      .update({
        max_global_concurrent_renders: n(data.maxGlobalConcurrentRenders, 1),
        max_user_concurrent_renders: n(data.maxUserConcurrentRenders, 1),
        max_renders_per_tick: n(data.maxRendersPerTick, 1),
        max_global_concurrent_uploads: n(data.maxGlobalConcurrentUploads, 1),
        max_user_concurrent_uploads: n(data.maxUserConcurrentUploads, 1),
        max_uploads_per_tick: n(data.maxUploadsPerTick, 1),
      })
      .eq("id", 1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
