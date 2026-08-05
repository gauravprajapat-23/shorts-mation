import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RenderSettingsView = {
  configured: boolean;
  source: "user" | "project" | "none";
  env: string;
  verifiedAt: string | null;
  lastError: string | null;
  keyHint: string | null;
  webhookConfigured: boolean;
  limits: {
    maxGlobalConcurrentRenders: number;
    maxUserConcurrentRenders: number;
    maxRendersPerTick: number;
    maxGlobalConcurrentUploads: number;
    maxUserConcurrentUploads: number;
    maxUploadsPerTick: number;
  };
};

/** Read-only status. The API key itself is never returned to the browser. */
export const getRenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RenderSettingsView> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAutomationLimits } = await import("@/lib/automation-limits.server");
    const { renderCallbackUrl } = await import("@/lib/render-settings.server");
    const { decryptToken } = await import("@/lib/token-crypto.server");

    const { data } = await supabaseAdmin
      .from("render_providers")
      .select("api_key_encrypted, env, verified_at, last_error")
      .eq("user_id", context.userId)
      .maybeSingle();

    const userKey = data?.api_key_encrypted ? await decryptToken(data.api_key_encrypted) : null;
    const projectKey = process.env["SHOTSTACK_API_KEY"] ?? null;
    const source = userKey ? "user" : projectKey ? "project" : "none";
    const active = userKey ?? projectKey;
    const limits = await getAutomationLimits();

    return {
      configured: Boolean(active),
      source,
      env: (userKey ? data?.env : process.env["SHOTSTACK_ENV"]) || "v1",
      verifiedAt: data?.verified_at ?? null,
      lastError: data?.last_error ?? null,
      keyHint: active ? `${active.slice(0, 4)}••••${active.slice(-4)}` : null,
      webhookConfigured: Boolean(renderCallbackUrl()),
      limits: {
        maxGlobalConcurrentRenders: limits.max_global_concurrent_renders,
        maxUserConcurrentRenders: limits.max_user_concurrent_renders,
        maxRendersPerTick: limits.max_renders_per_tick,
        maxGlobalConcurrentUploads: limits.max_global_concurrent_uploads,
        maxUserConcurrentUploads: limits.max_user_concurrent_uploads,
        maxUploadsPerTick: limits.max_uploads_per_tick,
      },
    };
  });

/** Verifies the key with a lightweight provider call, then stores it encrypted. */
export const saveRenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apiKey: string; env?: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const apiKey = (data.apiKey ?? "").trim();
    const env = (data.env ?? "v1").trim() === "stage" ? "stage" : "v1";
    if (apiKey.length < 12 || apiKey.length > 256 || /\s/.test(apiKey)) {
      return { ok: false, error: "That doesn't look like a valid API key." };
    }
    const { verifyShotstackKey } = await import("@/lib/shotstack.server");
    const check = await verifyShotstackKey({ key: apiKey, env });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!check.ok) {
      await supabaseAdmin
        .from("render_providers")
        .upsert({ user_id: context.userId, env, last_error: check.error ?? "Verification failed" }, { onConflict: "user_id" });
      return { ok: false, error: check.error ?? "Verification failed" };
    }
    const { encryptToken } = await import("@/lib/token-crypto.server");
    const { error } = await supabaseAdmin.from("render_providers").upsert(
      {
        user_id: context.userId,
        provider: "shotstack",
        env,
        api_key_encrypted: await encryptToken(apiKey),
        verified_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const clearRenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("render_providers").delete().eq("user_id", context.userId);
    return { ok: true };
  });
