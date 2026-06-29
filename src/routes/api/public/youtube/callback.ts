import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;
        const back = `${origin}/youtube-connect`;
        if (err) return Response.redirect(`${back}?yt_error=${encodeURIComponent(err)}`, 302);
        if (!code || !state) return Response.redirect(`${back}?yt_error=missing_code`, 302);
        const userId = state.split(".")[0];
        if (!userId) return Response.redirect(`${back}?yt_error=bad_state`, 302);

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
        const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
        const { error: upErr } = await supabaseAdmin.from("youtube_connections").upsert({
          user_id: userId,
          channel_id: ch.id,
          channel_name: ch.snippet.title,
          channel_avatar: ch.snippet.thumbnails?.default?.url ?? null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expires_at: expiresAt,
          is_connected: true,
        }, { onConflict: "user_id,channel_id" });
        if (upErr) return Response.redirect(`${back}?yt_error=${encodeURIComponent(upErr.message)}`, 302);
        return Response.redirect(`${back}?yt_connected=1`, 302);
      },
    },
  },
});