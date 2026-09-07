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

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        const requestOrigin = `${url.protocol}//${url.host}`;
        const origin = youtubeOAuthAppBaseUrl(requestOrigin);
        const redirectUri = youtubeOAuthRedirectUri(origin);
        const back = `${origin}/youtube-connect`;
        const clearStateCookie = () => deleteCookie("yt_oauth_state", { path: "/" });

        if (oauthError) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=${encodeURIComponent(oauthError)}`, 302);
        }
        if (!code || !state) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=missing_code`, 302);
        }

        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=server_misconfig`, 302);
        }
        const cookieState = getCookie("yt_oauth_state");
        if (!cookieState || !timingSafeStringEqual(cookieState, state)) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=csrf_state_mismatch`, 302);
        }

        const parsed = parseYouTubeOAuthState(state);
        if (!parsed) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=bad_state`, 302);
        }
        const signatureOk = await verifyYouTubeOAuthStateSignature(parsed.payload, parsed.signature, stateSecret);
        if (!signatureOk) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=bad_state_signature`, 302);
        }
        const ageMs = Date.now() - parsed.issuedAtMs;
        if (ageMs < 0 || ageMs > YOUTUBE_OAUTH_STATE_MAX_AGE_MS) {
          clearStateCookie();
          return Response.redirect(`${back}?yt_error=state_expired`, 302);
        }
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
          return Response.redirect(`${back}?yt_error=${encodeURIComponent(tokens.error_description ?? tokens.error ?? "token_exchange_failed")}`, 302);
        }

        const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const channels = (await chRes.json()) as {
          items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }>;
          error?: { message?: string };
        };
        if (!chRes.ok) {
          return Response.redirect(`${back}?yt_error=${encodeURIComponent(channels.error?.message ?? "channel_lookup_failed")}`, 302);
        }
        const channel = channels.items?.[0];
        if (!channel) return Response.redirect(`${back}?yt_error=no_channel`, 302);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken } = await import("@/lib/token-crypto.server");
        const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
        const encAccess = await encryptToken(tokens.access_token);
        const { data: existingConnection } = await supabaseAdmin
          .from("youtube_connections")
          .select("refresh_token_encrypted")
          .eq("user_id", parsed.userId)
          .eq("channel_id", channel.id)
          .maybeSingle();
        const encRefresh = tokens.refresh_token
          ? await encryptToken(tokens.refresh_token)
          : existingConnection?.refresh_token_encrypted ?? null;

        const { error: upsertError } = await supabaseAdmin.from("youtube_connections").upsert(
          {
            user_id: parsed.userId,
            channel_id: channel.id,
            channel_name: channel.snippet.title,
            channel_avatar: channel.snippet.thumbnails?.default?.url ?? null,
            access_token_encrypted: encAccess,
            refresh_token_encrypted: encRefresh,
            token_expiry: expiresAt,
            is_connected: true,
          },
          { onConflict: "user_id,channel_id" },
        );
        if (upsertError) return Response.redirect(`${back}?yt_error=${encodeURIComponent(upsertError.message)}`, 302);
        return Response.redirect(`${back}?yt_connected=1`, 302);
      },
    },
  },
});
