import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RenderInfrastructureView = {
  configured: boolean;
  source: "project" | "none";
  callbackConfigured: boolean;
  health: "healthy" | "unreachable" | "unknown";
  limits: {
    maxGlobalConcurrentRenders: number;
    maxUserConcurrentRenders: number;
    maxRendersPerTick: number;
    maxGlobalConcurrentUploads: number;
    maxUserConcurrentUploads: number;
    maxUploadsPerTick: number;
  };
};

/** Admin/diagnostic read only. There is intentionally no customer write API. */
export const getRenderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<RenderInfrastructureView> => {
    const { getAutomationLimits } = await import("@/lib/automation-limits.server");
    const { renderCallbackBaseUrl, getRenderWorkerConfig } = await import("@/lib/render-settings.server");
    const config = await getRenderWorkerConfig();
    let health: RenderInfrastructureView["health"] = "unknown";
    if (config) {
      const { verifyFfmpegWorker } = await import("@/lib/ffmpeg-worker.server");
      health = (await verifyFfmpegWorker(config)).ok ? "healthy" : "unreachable";
    }
    const limits = await getAutomationLimits();
    return {
      configured: Boolean(config),
      source: config ? "project" : "none",
      callbackConfigured: Boolean(renderCallbackBaseUrl()),
      health,
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
