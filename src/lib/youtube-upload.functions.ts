import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export async function getFreshYouTubeAccessToken(conn: {
  id: string;
  user_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
}): Promise<Tokens> {
  const { decryptToken, encryptToken, isEncryptedToken } = await import("@/lib/token-crypto.server");
  const currentAccess = await decryptToken(conn.access_token_encrypted);
  if (!currentAccess) throw new Error("No access token stored for this channel");

  // One-time at-rest upgrade: any legacy plaintext token found on this row is
  // re-written as ciphertext immediately, so plaintext never lingers in the DB.
  const legacyAccess = conn.access_token_encrypted && !isEncryptedToken(conn.access_token_encrypted);
  const legacyRefresh = conn.refresh_token_encrypted && !isEncryptedToken(conn.refresh_token_encrypted);
  if (legacyAccess || legacyRefresh) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { access_token_encrypted?: string; refresh_token_encrypted?: string } = {};
    if (legacyAccess) patch.access_token_encrypted = await encryptToken(currentAccess);
    if (legacyRefresh) patch.refresh_token_encrypted = await encryptToken(conn.refresh_token_encrypted!);
    await supabaseAdmin.from("youtube_connections").update(patch).eq("id", conn.id);
  }

  const now = Date.now();
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (expiry - now > 60_000) {
    return currentAccess;
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
  return j.access_token;
}

class UploadAlreadyClaimedError extends Error {}

async function claimUploadAttempt(itemId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nonce = globalThis.crypto.randomUUID();
  const { data, error } = await (supabaseAdmin as any).rpc("claim_upload_item", {
    p_item_id: itemId,
    p_worker_id: `youtube-worker:${nonce}`,
    p_idempotency_key: `youtube:${itemId}:${nonce}`,
  });
  if (error) throw new Error(error.message || "Could not claim YouTube upload");
  const attemptId = data?.[0]?.attempt_id as string | undefined;
  if (!attemptId) throw new UploadAlreadyClaimedError("This item is already being uploaded or was already published.");
  return attemptId;
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

async function uploadItemToYouTube(itemId: string, opts?: { publishAt?: string | null }) {
  const attemptId = await claimUploadAttempt(itemId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: item, error: iErr } = await supabaseAdmin.from("campaign_items").select("*").eq("id", itemId).single();
  if (iErr || !item) throw new Error("Item not found");
  const { data: campaign } = await supabaseAdmin.from("campaigns").select("*").eq("id", item.campaign_id).single();
  if (!campaign) throw new Error("Campaign not found");

  await (supabaseAdmin as any).from("upload_attempts").update({ status: "uploading", started_at: new Date().toISOString() }).eq("id", attemptId);

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
    const accessToken = await getFreshYouTubeAccessToken(conn);
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
      status: opts?.publishAt
        ? { privacyStatus: "private", publishAt: opts.publishAt, selfDeclaredMadeForKids: false }
        : { privacyStatus: yt.privacy ?? settings.default_privacy ?? "private", selfDeclaredMadeForKids: false },
    };

    // Resumable upload — start
    const startRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    // Persist the external side effect first. If the process crashes before the
    // campaign row update, the next claim reconciles this ID instead of uploading twice.
    await (supabaseAdmin as any).from("upload_attempts").update({ youtube_video_id: uploaded.id, provider_upload_ref: uploadUrl }).eq("id", attemptId);

    const { data: changed } = await supabaseAdmin.from("campaign_items").update({
      status: opts?.publishAt ? "scheduled" : "uploaded",
      youtube_publish_at: opts?.publishAt ?? null,
      youtube_video_id: uploaded.id,
      youtube_url: `https://youtube.com/shorts/${uploaded.id}`,
      error_message: null,
      active_upload_attempt_id: null,
    }).eq("id", itemId).eq("active_upload_attempt_id", attemptId).select("id");
    if (!changed?.length) throw new Error("Upload attempt is no longer active; refusing stale completion");
    await (supabaseAdmin as any).from("upload_attempts").update({
      status: "completed", youtube_video_id: uploaded.id, finished_at: new Date().toISOString(),
    }).eq("id", attemptId);

    await supabaseAdmin.from("automation_logs").insert({
      user_id: item.user_id,
      campaign_id: item.campaign_id,
      campaign_item_id: itemId,
      level: "info",
      message: opts?.publishAt
        ? `Uploaded to YouTube as private, auto-publishing at ${opts.publishAt} (${uploaded.id})`
        : `Uploaded to YouTube: ${uploaded.id}`,
      metadata_json: { video_id: uploaded.id } as never,
    });
    return { videoId: uploaded.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    await (supabaseAdmin as any).from("upload_attempts").update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() }).eq("id", attemptId);
    await supabaseAdmin.from("campaign_items").update({ status: "failed", active_upload_attempt_id: null, error_message: msg }).eq("id", itemId).eq("active_upload_attempt_id", attemptId);
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

export const processDueCampaignItems = async (): Promise<{ processed: number; errors: number; throttled?: number }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { effectiveCap, getAutomationLimits, getUserLimitOverrides, inFlightUploads } = await import("@/lib/automation-limits.server");
  const limits = await getAutomationLimits();
  const flight = await inFlightUploads();
  const overrides = await getUserLimitOverrides();
  const globalRoom = Math.max(0, limits.max_global_concurrent_uploads - flight.total);
  const perTick = Math.min(limits.max_uploads_per_tick, globalRoom);
  const nowIso = new Date().toISOString();
  // Upload starts at the item's upload lead time (20 min before publish) so the
  // bytes are on YouTube early; YouTube itself flips the video public at the
  // scheduled time via publishAt. Items with no lead time fall back to now.
  const { data: due } = await supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, schedule_at, upload_due_at, campaigns!inner(status)")
    .in("status", ["pending", "rendered", "upload_pending"])
    .not("rendered_video_url", "is", null)
    .or(`upload_due_at.lte.${nowIso},and(upload_due_at.is.null,schedule_at.lte.${nowIso})`)
    .order("schedule_at", { ascending: true })
    .limit(Math.max(perTick, 1) * 4);
  const rows = (due ?? []) as Array<{ id: string; user_id: string; schedule_at: string | null; campaigns: { status: string } | null }>;
  const perUser: Record<string, number> = { ...flight.perUser };
  let processed = 0, errors = 0, throttled = 0;
  for (const r of rows) {
    if (processed >= perTick) { throttled++; continue; }
    if (r.campaigns?.status !== "active") continue;
    const cap = effectiveCap(overrides, r.user_id, "uploads", limits.max_user_concurrent_uploads);
    if ((perUser[r.user_id] ?? 0) >= cap) { throttled++; continue; }
    perUser[r.user_id] = (perUser[r.user_id] ?? 0) + 1;
    const scheduled = r.schedule_at ? new Date(r.schedule_at).getTime() : 0;
    // Leave ~1 min of headroom; YouTube rejects publishAt in the past.
    const publishAt = scheduled > Date.now() + 60_000 ? new Date(scheduled).toISOString() : null;
    try { await uploadItemToYouTube(r.id, { publishAt }); processed++; } catch (e) { if (e instanceof UploadAlreadyClaimedError) { throttled++; } else { errors++; } }
  }

  // Reconcile scheduled rows with YouTube instead of assuming that a passed
  // publishAt means the remote video actually became public.
  const { data: publishDue } = await supabaseAdmin
    .from("campaign_items")
    .select("id,user_id,campaign_id,youtube_video_id,youtube_publish_at,campaigns!inner(youtube_connection_id)")
    .eq("status", "scheduled")
    .not("youtube_video_id", "is", null)
    .not("youtube_publish_at", "is", null)
    .lte("youtube_publish_at", nowIso)
    .limit(20);
  for (const row of (publishDue ?? []) as any[]) {
    try {
      const connectionId = row.campaigns?.youtube_connection_id as string | undefined;
      if (!connectionId) continue;
      const { data: conn } = await supabaseAdmin.from("youtube_connections").select("*").eq("id", connectionId).eq("user_id", row.user_id).single();
      if (!conn) continue;
      const token = await getFreshYouTubeAccessToken(conn as any);
      const check = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(row.youtube_video_id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!check.ok) continue;
      const body = await check.json() as { items?: Array<{ status?: { privacyStatus?: string } }> };
      if (body.items?.[0]?.status?.privacyStatus === "public") {
        await supabaseAdmin.from("campaign_items").update({ status: "uploaded", error_message: null }).eq("id", row.id).eq("status", "scheduled");
      }
    } catch {
      // Keep the row scheduled; the next cron pass can reconcile again.
    }
  }

  return { processed, errors, throttled };
};
