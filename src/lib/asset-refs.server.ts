import type { EditorDocument } from "@/lib/types";
import { collectAssetIds, collectLegacyAssetStoragePaths, attachLegacyAssetIdentities, hydrateDocumentAssetRefs, type AssetResolution } from "@/lib/asset-refs";

export async function hydrateDocumentAssetRefsServer<T extends EditorDocument>(doc: T, userId: string): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let identified = doc;
  const legacyPaths = collectLegacyAssetStoragePaths(doc);
  if (legacyPaths.length) {
    const { data: legacyRows, error: legacyError } = await (supabaseAdmin as any).from("assets").select("id,storage_path").eq("user_id", userId).eq("lifecycle_status", "active").in("storage_path", legacyPaths);
    if (legacyError) throw new Error(`Could not recover legacy asset references: ${legacyError.message}`);
    identified = attachLegacyAssetIdentities(doc, new Map((legacyRows ?? []).filter((r: any) => r.storage_path).map((r: any) => [String(r.storage_path), { id: String(r.id), storagePath: String(r.storage_path) }]))) as T;
  }
  const ids = collectAssetIds(identified);
  if (!ids.length) return identified;
  const { data, error } = await (supabaseAdmin as any).from("assets").select("id,user_id,storage_path,lifecycle_status").eq("user_id", userId).in("id", ids);
  if (error) throw new Error(`Could not resolve durable assets: ${error.message}`);
  const rows = data ?? [];
  const found = new Set(rows.map((r: any) => String(r.id).toLowerCase()));
  const missing = ids.filter((id) => !found.has(id.toLowerCase()));
  if (missing.length) throw new Error(`Template references ${missing.length} missing asset(s): ${missing.slice(0, 3).join(", ")}`);
  const resolutions = new Map<string, AssetResolution>();
  await Promise.all(rows.map(async (row: any) => {
    if (row.lifecycle_status !== "active" || !row.storage_path) throw new Error(`Asset ${row.id} is ${row.lifecycle_status ?? "unavailable"}`);
    const { data: signed, error: signError } = await supabaseAdmin.storage.from("assets").createSignedUrl(String(row.storage_path).replace(/^assets\//, ""), 60 * 60 * 6);
    if (signError || !signed?.signedUrl) throw new Error(`Could not sign asset ${row.id}`);
    resolutions.set(String(row.id).toLowerCase(), { id: row.id, url: signed.signedUrl, storagePath: row.storage_path });
  }));
  return hydrateDocumentAssetRefs(identified, resolutions);
}
