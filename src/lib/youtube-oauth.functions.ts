import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signYouTubeOAuthState, youtubeOAuthAppBaseUrl, youtubeOAuthRedirectUri } from "@/lib/youtube-oauth-state";

// Least-privilege scopes required by the current product: upload videos,
// inspect the connected channel/playlists, and read YouTube Analytics.
export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export const getYouTubeAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");
    const stateSecret = process.env.OAUTH_STATE_SECRET;
    if (!stateSecret) throw new Error("OAUTH_STATE_SECRET is not configured");

    const request = getRequest();
    const requestUrl = new URL(request.url);
    const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
    const appUrl = youtubeOAuthAppBaseUrl(requestOrigin);
    const redirectUri = youtubeOAuthRedirectUri(appUrl);
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const issuedAt = Date.now().toString(36);
    const payload = `${context.userId}.${nonce}.${issuedAt}`;
    const sig = await signYouTubeOAuthState(payload, stateSecret);
    const state = `${payload}.${sig}`;

    setCookie("yt_oauth_state", state, {
      httpOnly: true,
      // Secure cookies are mandatory in production, but setting Secure on a
      // localhost/http callback makes browsers drop the state cookie entirely.
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: YOUTUBE_OAUTH_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
      include_granted_scopes: "true",
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, redirectUri };
  });

export const disconnectYouTubeChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { connectionId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptToken } = await import("@/lib/token-crypto.server");
    const { data: connection, error } = await supabaseAdmin
      .from("youtube_connections")
      .select("id,user_id,access_token_encrypted,refresh_token_encrypted")
      .eq("id", data.connectionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!connection) throw new Error("YouTube connection not found");

    // Best-effort Google revocation. Local disconnect must still succeed when
    // Google is unavailable or the token was already revoked externally.
    const refreshToken = await decryptToken(connection.refresh_token_encrypted);
    const accessToken = await decryptToken(connection.access_token_encrypted);
    const token = refreshToken || accessToken;
    let revokedAtGoogle = false;
    if (token) {
      try {
        const revoke = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
        revokedAtGoogle = revoke.ok;
      } catch {
        // Intentionally continue with local credential destruction.
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("youtube_connections")
      .update({
        is_connected: false,
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expiry: null,
      })
      .eq("id", connection.id)
      .eq("user_id", context.userId);
    if (updateError) throw updateError;
    return { ok: true, revokedAtGoogle };
  });
