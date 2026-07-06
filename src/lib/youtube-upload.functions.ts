import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Tokens = { access_token: string; expires_at: string | null };
type PublishResult = { ok: true; videoId: string } | { ok: false; error: string };

// SSRF guard: only fetch video bytes from Supabase storage signed URLs on
// this project's Supabase host. Rejects link-local/private/metadata endpoints
// and any other user-supplied host.
function allowedStorageHost(): string | null {
  const raw = process.env.SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedSignedStorageUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = allowedStorageHost();
  if (!host || u.host.toLowerCase() !== host) return false;
  // Supabase storage signed URLs live under /storage/v1/object/sign/
  return u.pathname.startsWith("/storage/v1/object/sign/");
}

async function signedStorageUrl(bucket: "assets" | "renders", path: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cleanPath = path.replace(/^\/+/, "");
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(cleanPath, 60 * 20);
  if (error || !data?.signedUrl) throw new Error(`Could not prepare ${bucket} video for upload`);
  return data.signedUrl;
}

async function resolveStoredUrl(bucket: "assets" | "renders", fileUrl?: string | null, storagePath?: string | null): Promise<string | null> {
  const candidate = storagePath || fileUrl;
  if (!candidate) return null;
  // If it's already an absolute URL, only accept it when it's a Supabase
  // signed storage URL on our project host. Otherwise re-sign the path via
  // the admin client.
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("data:") || candidate.startsWith("blob:")) {
    if (candidate.startsWith("data:") || candidate.startsWith("blob:")) return null;
    if (isAllowedSignedStorageUrl(candidate)) return candidate;
    // Attempt to recover a storage path from a bucket-scoped URL, otherwise reject.
    const m = candidate.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/i);
    if (m && (m[1] === bucket)) return signedStorageUrl(bucket, decodeURIComponent(m[2]));
    return null;
  }
  if (candidate.startsWith("blob:")) return null;
  return signedStorageUrl(bucket, candidate.replace(new RegExp(`^${bucket}/`), ""));
}

async function refreshIfNeeded(conn: {
  id: string;
  user_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
}): Promise<Tokens> {
  const { decryptToken, encryptToken } = await import("@/lib/token-crypto.server");
  const currentAccess = await decryptToken(conn.access_token_encrypted);
  if (!currentAccess) throw new Error("No access token stored for this channel");
  const now = Date.now();
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (expiry - now > 60_000) {
    return { access_token: currentAccess, expires_at: conn.token_expiry };
  }
  const refreshToken = await decryptToken(conn.refresh_token_encrypted);
  if (!refreshToken) {
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
      refresh_token: refreshToken,
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description ?? j.error ?? "Token refresh failed");
  const expiresAt = j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const encAccess = await encryptToken(j.access_token);
  await supabaseAdmin.from("youtube_connections").update({
    access_token_encrypted: encAccess,
    token_expiry: expiresAt,
  }).eq("id", conn.id);
  return { access_token: j.access_token, expires_at: expiresAt };
}

async function pickVideoUrl(userId: string, backgroundFileName: string | undefined | null, storedUrl: string | null | undefined): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rendered = await resolveStoredUrl("renders", storedUrl, null);
  if (rendered) return rendered;

  if (backgroundFileName) {
    // Never fetch arbitrary user-supplied URLs. Only treat this value as a
    // storage path lookup — if it happens to be a full URL, drop it and fall
    // back to the assets table lookup below.
    if (backgroundFileName.startsWith(`${userId}/`)) return signedStorageUrl("assets", backgroundFileName);
    const { data } = await supabaseAdmin
      .from("assets")
      .select("file_url, storage_path")
      .eq("user_id", userId)
      .eq("file_name", backgroundFileName)
      .limit(1)
      .maybeSingle();
    const background = await resolveStoredUrl("assets", data?.file_url, data?.storage_path);
    if (background) return background;
  }

  // Fallback: any uploaded video asset owned by this user.
  const { data: anyVideo } = await supabaseAdmin
    .from("assets")
    .select("file_url, storage_path")
    .eq("user_id", userId)
    .eq("type", "video")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fallback = await resolveStoredUrl("assets", anyVideo?.file_url, anyVideo?.storage_path);
  if (fallback) return fallback;
  throw new Error("No video available to upload. Open the campaign's Test Render page, click 'Render MP4' for this row, or upload a background video on the Assets page.");
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
    if (!isAllowedSignedStorageUrl(videoUrl)) {
      throw new Error("Refusing to fetch video from an untrusted host.");
    }
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Fetch video failed: ${videoRes.status}`);
    const videoBlob = await videoRes.blob();
    if (!videoBlob.size) {
      throw new Error("The rendered video file is empty. Re-render MP4 for this row, then publish again.");
    }
    if (videoBlob.type && !videoBlob.type.startsWith("video/")) {
      throw new Error("The selected upload source is not a video file. Render MP4 for this row or choose an uploaded video asset.");
    }

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
  .handler(async ({ data, context }): Promise<PublishResult> => {
    // Verify ownership before granting admin path
    const { data: item, error } = await context.supabase
      .from("campaign_items").select("id,user_id").eq("id", data.itemId).single();
    if (error || !item || item.user_id !== context.userId) return { ok: false, error: "Item not found" };
    try {
      const uploaded = await uploadItemToYouTube(data.itemId);
      return { ok: true, videoId: uploaded.videoId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
    }
  });

export const processDueCampaignItems = async (): Promise<{ processed: number; errors: number }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("campaign_items")
    .select("id, campaign_id, schedule_at, campaigns!inner(status)")
    .in("status", ["pending", "rendered", "upload_pending"])
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
