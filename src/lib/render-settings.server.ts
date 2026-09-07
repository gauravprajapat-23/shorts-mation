import type { FfmpegWorkerConfig } from "@/lib/ffmpeg-worker.server";

const PROJECT_URL = "https://project--1f227d26-fb40-4f58-b063-0860a2b9495f.lovable.app";

export function appBaseUrl() {
  return (process.env.PUBLIC_APP_URL || PROJECT_URL).replace(/\/+$/, "");
}

export function renderCallbackBaseUrl() {
  return `${appBaseUrl()}/api/public/hooks/render-callback`;
}

export function renderManifestBaseUrl() {
  return `${appBaseUrl()}/api/public/render-manifest`;
}

/**
 * Phase 0 infrastructure boundary: render workers are application-owned.
 * A SaaS customer must never provide or manage worker URL/secret credentials.
 * `userId` remains accepted temporarily so the Phase 0 change is non-breaking
 * for queue code; it is intentionally ignored.
 */
export async function getRenderWorkerConfig(_userId?: string): Promise<FfmpegWorkerConfig | null> {
  const url = process.env.FFMPEG_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.FFMPEG_WORKER_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

export async function hasRenderCredentials(_userId?: string) {
  return Boolean(await getRenderWorkerConfig());
}
