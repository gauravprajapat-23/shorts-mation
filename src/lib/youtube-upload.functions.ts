import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Tokens = { access_token: string; expires_at: string | null };

async function refreshIfNeeded(conn: {
  id: string;
  user_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
}): Promise<Tokens> {
  if (!conn.access_token_encrypted) throw new Error("No access token stored for this channel");
  const now = Date.now();
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (expiry - now > 60_000) {
    return { access_token: conn.access_token_encrypted, expires_at: conn.token_expiry };
  }
  if (!conn.refresh_token_encrypted) {
    // Token is expired and we can't refresh — surface a clear error
    throw new Error("YouTube token expired and no refresh_token on file. Reconnect the channel.");
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured on the server");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token_encrypted,
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description ?? j.error ?? "Token refresh failed");
  const expiresAt = j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("youtube_connections").update({
    access_token_encrypted: j.access_token,
    token_expiry: expiresAt,
  }).eq("id", conn.id);
  return { access_token: j.access_token, expires_at: expiresAt };
}

async function pickVideoUrl(userId: string, backgroundFileName: string | undefined | null, storedUrl: string | null | undefined): Promise<string> {
  if (storedUrl) return storedUrl;
  if (backgroundFileName) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("assets")
      .select("file_url")
      .eq("user_id", userId)
      .eq("file_name", backgroundFileName)
      .limit(1)
      .maybeSingle();
    if (data?.file_url) return data.file_url;
  }
  throw new Error("No video source: render a video first or point background_file_name at an uploaded asset");
}

async function uploadItemToYouTube(itemId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: item, error: iErr } = await supabaseAdmin.from("campaign_items").select("*").eq("id", itemId).single();
  if (iErr || !item) throw new Error("Item not found");
  const { data: campaign } = await supabaseAdmin.from("campaigns").select("*").eq("id", item.campaign_id).single();
  if (!campaign) throw new Error("Campaign not found");

  await supabaseAdmin.from("campaign_items").update({ status: "uploading", error_message: null }).eq("id", itemId);

  try {
    let conn: any = null;
    if (campaign.youtube_connection_id) {
      const { data } = await supabaseAdmin.from("youtube_connections").select("*").eq("id", campaign.youtube_connection_id).maybeSingle();
      conn = data;
    }
    if (!conn) {
      // Fallback: use the user's most recent YouTube connection
      const { data } = await supabaseAdmin
        .from("youtube_connections")
        .select("*")
        .eq("user_id", item.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      conn = data;
      if (conn) {
        await supabaseAdmin.from("campaigns").update({ youtube_connection_id: conn.id }).eq("id", campaign.id);
      }
    }
    if (!conn) throw new Error("No YouTube channel connected. Open YouTube page and connect your channel, then retry.");
    const tokens = await refreshIfNeeded(conn);
    const seo = (item.seo_json ?? {}) as { title?: string; description?: string; tags?: string[]; hashtags?: string[] };
    const yt = (item.youtube_settings_json ?? {}) as { privacy?: "private" | "unlisted" | "public"; category?: string };
    const asset = (item.asset_json ?? {}) as { background_file_name?: string };
    const settings = (campaign.settings_json ?? {}) as { default_privacy?: "private" | "unlisted" | "public" };

    const videoUrl = await pickVideoUrl(item.user_id, asset.background_file_name, item.rendered_video_url);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Fetch video failed: ${videoRes.status}`);
    const videoBlob = await videoRes.blob();

    const metadata = {
      snippet: {
        title: (seo.title ?? item.video_file_name ?? "Untitled").slice(0, 100),
        description: [seo.description ?? "", (seo.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n").slice(0, 5000),
        tags: (seo.tags ?? []).slice(0, 30),
        categoryId: "22",
      },
      status: { privacyStatus: yt.privacy ?? settings.default_privacy ?? "private", selfDeclaredMadeForKids: false },
    };

    // Resumable upload — start
    const startRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": videoBlob.type || "video/mp4",
        "X-Upload-Content-Length": String(videoBlob.size),
      },
      body: JSON.stringify(metadata),
    });
    if (!startRes.ok) throw new Error(`YouTube init failed: ${startRes.status} ${await startRes.text()}`);
    const uploadUrl = startRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return an upload URL");

    // Single-shot PUT (fine for Shorts < 100MB; resumable protocol allows it)
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": videoBlob.type || "video/mp4", "Content-Length": String(videoBlob.size) },
      body: videoBlob,
    });
    if (!putRes.ok) throw new Error(`YouTube upload failed: ${putRes.status} ${await putRes.text()}`);
    const uploaded = (await putRes.json()) as { id?: string };
    if (!uploaded.id) throw new Error("YouTube did not return a video id");

    await supabaseAdmin.from("campaign_items").update({
      status: "uploaded",
      youtube_video_id: uploaded.id,
      youtube_url: `https://youtube.com/shorts/${uploaded.id}`,
      error_message: null,
    }).eq("id", itemId);

    await supabaseAdmin.from("automation_logs").insert({
      user_id: item.user_id,
      campaign_id: item.campaign_id,
      campaign_item_id: itemId,
      level: "info",
      message: `Uploaded to YouTube: ${uploaded.id}`,
      metadata_json: { video_id: uploaded.id } as never,
    });
    return { videoId: uploaded.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    await supabaseAdmin.from("campaign_items").update({ status: "failed", error_message: msg }).eq("id", itemId);
    await supabaseAdmin.from("automation_logs").insert({
      user_id: item.user_id,
      campaign_id: item.campaign_id,
      campaign_item_id: itemId,
      level: "error",
      message: msg,
      metadata_json: {} as never,
    });
    throw e;
  }
}

export const publishItemNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data, context }) => {
    // Verify ownership before granting admin path
    const { data: item, error } = await context.supabase
      .from("campaign_items").select("id,user_id").eq("id", data.itemId).single();
    if (error || !item || item.user_id !== context.userId) throw new Error("Not found");
    return uploadItemToYouTube(data.itemId);
  });

export const processDueCampaignItems = async (): Promise<{ processed: number; errors: number }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("campaign_items")
    .select("id, campaign_id, schedule_at, campaigns!inner(status)")
    .eq("status", "pending")
    .lte("schedule_at", nowIso)
    .limit(25);
  const rows = (due ?? []) as Array<{ id: string; campaigns: { status: string } | null }>;
  let processed = 0, errors = 0;
  for (const r of rows) {
    if (r.campaigns?.status !== "active") continue;
    try { await uploadItemToYouTube(r.id); processed++; } catch { errors++; }
  }
  return { processed, errors };
};
