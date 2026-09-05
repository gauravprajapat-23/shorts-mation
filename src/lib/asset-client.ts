import { supabase } from "@/integrations/supabase/client";
import type { EditorDocument } from "@/lib/types";
import { collectAssetIds, collectLegacyAssetStoragePaths, attachLegacyAssetIdentities, hydrateDocumentAssetRefs, assetUri, type AssetResolution } from "@/lib/asset-refs";

export type UploadedAssetHandle = {
  id: string;
  url: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  deduplicated: boolean;
};

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("assets").createSignedUrl(path.replace(/^assets\//, ""), 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("Could not prepare asset preview URL");
  return data.signedUrl;
}

export async function storageUsage(): Promise<{ usedBytes: number; quotaBytes: number }> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  if (!auth.user) throw new Error("Not signed in");

  // Primary path: the DB function enforces auth.uid() === p_user_id and also
  // returns any custom per-user quota. A previous hardening migration revoked
  // this grant accidentally; keep a safe RLS-backed fallback so uploads do not
  // become globally unusable if that migration has not been applied yet.
  const { data, error } = await (supabase as any).rpc("asset_storage_usage", { p_user_id: auth.user.id });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return { usedBytes: Number(row?.used_bytes ?? 0), quotaBytes: Number(row?.quota_bytes ?? 5 * 1024 ** 3) };
  }

  const permissionDenied = /permission denied|not allowed|42501/i.test(String(error.message ?? error.code ?? ""));
  if (!permissionDenied) throw new Error(`Could not read storage usage: ${error.message}`);

  // Fallback is deliberately conservative. RLS restricts the assets query to
  // the signed-in user. The DB quota trigger is still authoritative at INSERT,
  // so a lower custom quota cannot be bypassed by this client-side fallback.
  const fallback = await (supabase as any).from("assets")
    .select("size")
    .eq("user_id", auth.user.id)
    .eq("lifecycle_status", "active");
  if (fallback.error) throw new Error(`Could not read asset usage: ${fallback.error.message}`);
  const usedBytes = (fallback.data ?? []).reduce((sum: number, row: any) => sum + Number(row.size ?? 0), 0);
  return { usedBytes, quotaBytes: 5 * 1024 ** 3 };
}

function friendlyUploadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "Upload failed");
  if (/bucket not found/i.test(message)) return new Error("Assets storage is not configured. Apply the latest storage migration and retry.");
  if (/row-level security|violates row-level security|permission denied|not authorized|403/i.test(message)) {
    return new Error("Asset upload permission was denied. Apply the latest asset-storage permission migration, sign out/in, and retry.");
  }
  if (/payload too large|entity too large|413/i.test(message)) return new Error("This file is larger than the configured storage upload limit.");
  return error instanceof Error ? error : new Error(message);
}

export async function uploadDurableAsset(file: File): Promise<UploadedAssetHandle> {
  if (!file || file.size <= 0) throw new Error("Choose a non-empty file to upload.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  if (!auth.user) throw new Error("Not signed in");
  const userId = auth.user.id;
  const contentHash = await sha256(file);
  const existing = await (supabase as any).from("assets").select("id,file_name,storage_path,mime_type,size").eq("user_id", userId).eq("content_hash", contentHash).eq("lifecycle_status", "active").limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id && existing.data.storage_path) {
    return { id: existing.data.id, url: await sign(existing.data.storage_path), storagePath: existing.data.storage_path, fileName: existing.data.file_name, mimeType: existing.data.mime_type ?? file.type, size: Number(existing.data.size ?? file.size), deduplicated: true };
  }

  const usage = await storageUsage();
  if (usage.usedBytes + file.size > usage.quotaBytes) {
    const left = Math.max(0, usage.quotaBytes - usage.usedBytes);
    throw new Error(`Storage quota exceeded. ${Math.round(left / 1024 / 1024)} MB remaining.`);
  }

  const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const path = `${userId}/${contentHash}.${ext}`;
  const id = crypto.randomUUID();
  const kind: "image" | "video" | "audio" = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
  const contentType = file.type || (kind === "image" ? "application/octet-stream" : kind === "video" ? "video/mp4" : "audio/mpeg");
  const { error: uploadError } = await supabase.storage.from("assets").upload(path, file, { upsert: false, contentType });
  if (uploadError) {
    const raced = await (supabase as any).from("assets").select("id,file_name,storage_path,mime_type,size").eq("user_id", userId).eq("content_hash", contentHash).eq("lifecycle_status", "active").limit(1).maybeSingle();
    if (raced.data?.id && raced.data.storage_path) {
      return { id: raced.data.id, url: await sign(raced.data.storage_path), storagePath: raced.data.storage_path, fileName: raced.data.file_name, mimeType: raced.data.mime_type ?? file.type, size: Number(raced.data.size ?? file.size), deduplicated: true };
    }
    throw friendlyUploadError(uploadError);
  }
  const { error: insertError } = await (supabase as any).from("assets").insert({
    id, user_id: userId, type: kind, file_name: file.name, file_url: assetUri(id), storage_path: path,
    size: file.size, mime_type: contentType, content_hash: contentHash, lifecycle_status: "active",
  });
  if (insertError) {
    await supabase.storage.from("assets").remove([path]);
    throw friendlyUploadError(insertError);
  }
  return { id, url: await sign(path), storagePath: path, fileName: file.name, mimeType: contentType, size: file.size, deduplicated: false };
}

export async function hydrateDocumentAssetRefsClient<T extends EditorDocument>(doc: T): Promise<T> {
  let identified = doc;
  const legacyPaths = collectLegacyAssetStoragePaths(doc);
  if (legacyPaths.length) {
    const { data: legacyRows, error: legacyError } = await (supabase as any).from("assets").select("id,storage_path").in("storage_path", legacyPaths).eq("lifecycle_status", "active");
    if (legacyError) throw legacyError;
    identified = attachLegacyAssetIdentities(doc, new Map((legacyRows ?? []).filter((r: any) => r.storage_path).map((r: any) => [String(r.storage_path), { id: String(r.id), storagePath: String(r.storage_path) }]))) as T;
  }
  const ids = collectAssetIds(identified);
  if (!ids.length) return identified;
  const { data, error } = await (supabase as any).from("assets").select("id,storage_path,lifecycle_status").in("id", ids);
  if (error) throw error;
  const resolutions = new Map<string, AssetResolution>();
  await Promise.all((data ?? []).filter((a: any) => a.lifecycle_status === "active" && a.storage_path).map(async (a: any) => {
    try { resolutions.set(String(a.id).toLowerCase(), { id: a.id, url: await sign(a.storage_path), storagePath: a.storage_path }); } catch { /* leave unresolved */ }
  }));
  return hydrateDocumentAssetRefs(identified, resolutions);
}
