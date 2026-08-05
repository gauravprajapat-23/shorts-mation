// Per-user render-farm credentials + the webhook callback URL used to advance
// renders without polling. The API key is stored encrypted and only ever read
// here, on the server.
import type { RenderCredentials } from "@/lib/shotstack.server";

const PROJECT_URL = "https://project--1f227d26-fb40-4f58-b063-0860a2b9495f.lovable.app";

export function appBaseUrl(): string {
  return (process.env["PUBLIC_APP_URL"] || PROJECT_URL).replace(/\/+$/, "");
}

export function renderCallbackUrl(): string | null {
  const secret = process.env["RENDER_WEBHOOK_SECRET"];
  if (!secret) return null;
  return `${appBaseUrl()}/api/public/hooks/render-callback?token=${encodeURIComponent(secret)}`;
}

/** Resolves the key for a user: their saved key first, project env as fallback. */
export async function getRenderCredentials(userId: string): Promise<RenderCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("render_providers")
    .select("api_key_encrypted, env")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.api_key_encrypted) {
    const { decryptToken } = await import("@/lib/token-crypto.server");
    const key = await decryptToken(data.api_key_encrypted);
    if (key) return { key, env: data.env || "v1" };
  }
  const envKey = process.env["SHOTSTACK_API_KEY"];
  if (envKey) return { key: envKey, env: process.env["SHOTSTACK_ENV"] || "v1" };
  return null;
}

export async function hasRenderCredentials(userId: string): Promise<boolean> {
  return Boolean(await getRenderCredentials(userId));
}
