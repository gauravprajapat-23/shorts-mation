import { createFileRoute } from "@tanstack/react-router";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

async function verifyStateSig(payload: string, sig: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const b64 = sig.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(sig.length / 4) * 4, "=");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", key, bytes.buffer as ArrayBuffer, new TextEncoder().encode(payload));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const requestOrigin = `${url.protocol}//${url.host}`;
        const origin = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") ?? requestOrigin;
        const back = `${origin}/youtube-connect`;
        // Always clear the state cookie before any redirect.
        const clearStateCookie = () => deleteCookie("yt_oauth_state", { path: "/" });
        if (err) return Response.redirect(`${back}?yt_error=${encodeURIComponent(err)}`, 302);
        if (!code || !state) return Response.redirect(`${back}?yt_error=missing_code`, 302);

        // CSRF: double-submit cookie + HMAC verification of state.
        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) return Response.redirect(`${back}?yt_error=server_misconfig`, 302);
        const cookieState = getCookie("yt_oauth_state");
        if (!cookieState || !timingSafeEqual(cookieState, state)) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=csrf_state_mismatch`, 302);
        }
        const parts = state.split(".");
        if (parts.length !== 4) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=bad_state`, 302);
        }
        const [userId, nonce, issuedAt, sig] = parts;
        const payload = `${userId}.${nonce}.${issuedAt}`;
        const sigOk = await verifyStateSig(payload, sig, stateSecret);
        if (!sigOk) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=bad_state_signature`, 302);
        }
        const issuedAtMs = parseInt(issuedAt, 36);
        if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > STATE_MAX_AGE_MS) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=state_expired`, 302);
        }
        // State verified — consume it.
        clearStateCookie();

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) return Response.redirect(`${back}?yt_error=server_misconfig`, 302);

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: `${origin}/api/public/youtube/callback`,
            grant_type: "authorization_code",
          }),
        });
        const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
        if (!tokenRes.ok || !tokens.access_token) {
          return Response.redirect(`${back}?yt_error=${encodeURIComponent(tokens.error_description ?? tokens.error ?? "token_exchange_failed")}`, 302);
        }

        const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const channels = (await chRes.json()) as { items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }> };
        const ch = channels.items?.[0];
        if (!ch) return Response.redirect(`${back}?yt_error=no_channel`, 302);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken } = await import("@/lib/token-crypto.server");
        const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
        const encAccess = await encryptToken(tokens.access_token);
        const { data: existingConnection } = await supabaseAdmin.from("youtube_connections")
          .select("refresh_token_encrypted")
          .eq("user_id", userId).eq("channel_id", ch.id).maybeSingle();
        // Google commonly omits refresh_token on reconnect. Never erase a valid
        // stored refresh token just because this authorization response omitted it.
        const encRefresh = tokens.refresh_token
          ? await encryptToken(tokens.refresh_token)
          : existingConnection?.refresh_token_encrypted ?? null;
        const { error: upErr } = await supabaseAdmin.from("youtube_connections").upsert({
          user_id: userId,
          channel_id: ch.id,
          channel_name: ch.snippet.title,
          channel_avatar: ch.snippet.thumbnails?.default?.url ?? null,
          access_token_encrypted: encAccess,
          refresh_token_encrypted: encRefresh,
          token_expiry: expiresAt,
          is_connected: true,
        }, { onConflict: "user_id,channel_id" });
        if (upErr) return Response.redirect(`${back}?yt_error=${encodeURIComponent(upErr.message)}`, 302);
        return Response.redirect(`${back}?yt_connected=1`, 302);
      },
    },
  },
});