import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import {
  parseYouTubeOAuthState,
  timingSafeStringEqual,
  verifyYouTubeOAuthStateSignature,
  YOUTUBE_OAUTH_STATE_MAX_AGE_MS,
  youtubeOAuthAppBaseUrl,
  youtubeOAuthRedirectUri,
} from "@/lib/youtube-oauth-state";

function mutableRedirect(location: string) {
  // The native redirect helper creates immutable Headers in Node/Undici. TanStack Start
  // merges event headers (notably Set-Cookie from deleteCookie) into route responses,
  // which requires a mutable Headers object. Construct the redirect manually.
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}

function oauthRedirect(back: string, code: string) {
  return mutableRedirect(`${back}?yt_error=${encodeURIComponent(code)}`);
}

function safeOAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/TOKEN_ENCRYPTION_KEY/i.test(message)) return "token_encryption_not_configured";
  if (/SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i.test(message)) return "supabase_server_not_configured";
  if (/workspace|organization|membership|permission/i.test(message)) return "workspace_permission_denied";
  return "callback_server_error";
}

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const requestOrigin = `${url.protocol}//${url.host}`;
        const origin = youtubeOAuthAppBaseUrl(requestOrigin);
        const redirectUri = youtubeOAuthRedirectUri(origin);
        const back = `${origin}/youtube-connect`;
        const clearStateCookie = () => deleteCookie("yt_oauth_state", { path: "/" });

        try {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          const oauthError = url.searchParams.get("error");

          if (oauthError) {
            clearStateCookie();
            return oauthRedirect(back, oauthError);
          }
          if (!code || !state) {
            clearStateCookie();
            return oauthRedirect(back, "missing_code");
          }

          const stateSecret = process.env.OAUTH_STATE_SECRET;
          if (!stateSecret) {
            clearStateCookie();
            return oauthRedirect(back, "oauth_state_secret_not_configured");
          }

          const cookieState = getCookie("yt_oauth_state");
          if (!cookieState || !timingSafeStringEqual(cookieState, state)) {
            clearStateCookie();
            return oauthRedirect(back, "csrf_state_mismatch");
          }

          const parsed = parseYouTubeOAuthState(state);
          if (!parsed) {
            clearStateCookie();
            return oauthRedirect(back, "bad_state");
          }
          const signatureOk = await verifyYouTubeOAuthStateSignature(parsed.payload, parsed.signature, stateSecret);
          if (!signatureOk) {
            clearStateCookie();
            return oauthRedirect(back, "bad_state_signature");
          }
          const ageMs = Date.now() - parsed.issuedAtMs;
          if (ageMs < 0 || ageMs > YOUTUBE_OAUTH_STATE_MAX_AGE_MS) {
            clearStateCookie();
            return oauthRedirect(back, "state_expired");
          }

          // State has been fully authenticated. Clear it before any external API calls
          // so a callback URL cannot accidentally be replayed in the same browser.
          clearStateCookie();

          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          if (!clientId || !clientSecret) return oauthRedirect(back, "google_oauth_not_configured");
          if (!process.env.TOKEN_ENCRYPTION_KEY) return oauthRedirect(back, "token_encryption_not_configured");
          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return oauthRedirect(back, "supabase_server_not_configured");
          }

          // Resolve the workspace before exchanging/storing credentials. Phase 12 makes
          // organization_id the tenant boundary; connecting a channel is an Owner/Admin action.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: memberships, error: membershipError } = await supabaseAdmin
            .from("organization_members")
            .select("organization_id,role,joined_at")
            .eq("user_id", parsed.userId)
            .eq("status", "active")
            .in("role", ["owner", "admin"])
            .order("joined_at", { ascending: true });
          if (membershipError) throw new Error(`workspace lookup failed: ${membershipError.message}`);
          const membership = memberships?.find((row) => row.role === "owner") ?? memberships?.[0];
          if (!membership?.organization_id) return oauthRedirect(back, "workspace_permission_denied");
          const organizationId = membership.organization_id;

          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });
          const tokens = (await tokenRes.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error?: string;
            error_description?: string;
          };
          if (!tokenRes.ok || !tokens.access_token) {
            return oauthRedirect(back, tokens.error_description ?? tokens.error ?? "token_exchange_failed");
          }

          const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const channels = (await chRes.json()) as {
            items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }>;
            error?: { message?: string };
          };
          if (!chRes.ok) return oauthRedirect(back, channels.error?.message ?? "channel_lookup_failed");
          const channel = channels.items?.[0];
          if (!channel) return oauthRedirect(back, "no_channel");

          const { encryptToken } = await import("@/lib/token-crypto.server");
          const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
          const encAccess = await encryptToken(tokens.access_token);

          // Prefer an existing workspace-owned connection. This preserves its refresh token
          // when Google omits refresh_token on subsequent consent cycles.
          const { data: existingConnection, error: existingError } = await supabaseAdmin
            .from("youtube_connections")
            .select("id,refresh_token_encrypted")
            .eq("organization_id", organizationId)
            .eq("channel_id", channel.id)
            .maybeSingle();
          if (existingError) throw new Error(`YouTube connection lookup failed: ${existingError.message}`);

          const encRefresh = tokens.refresh_token
            ? await encryptToken(tokens.refresh_token)
            : existingConnection?.refresh_token_encrypted ?? null;

          const connectionPayload = {
            user_id: parsed.userId,
            organization_id: organizationId,
            channel_id: channel.id,
            channel_name: channel.snippet.title,
            channel_avatar: channel.snippet.thumbnails?.default?.url ?? null,
            access_token_encrypted: encAccess,
            refresh_token_encrypted: encRefresh,
            token_expiry: expiresAt,
            is_connected: true,
          };

          const write = existingConnection
            ? await supabaseAdmin.from("youtube_connections").update(connectionPayload).eq("id", existingConnection.id)
            : await supabaseAdmin.from("youtube_connections").upsert(connectionPayload, { onConflict: "user_id,channel_id" });
          if (write.error) throw new Error(`YouTube connection save failed: ${write.error.message}`);

          return mutableRedirect(`${back}?yt_connected=1`);
        } catch (error) {
          // Never let an OAuth callback collapse into TanStack's generic error page.
          // Keep detailed diagnostics server-side and return only a stable/safe code to the browser.
          console.error("[YouTube OAuth callback]", error);
          try {
            clearStateCookie();
          } catch {
            // Cookie cleanup is best-effort on an already-failed callback.
          }
          return oauthRedirect(back, safeOAuthError(error));
        }
      },
    },
  },
});
