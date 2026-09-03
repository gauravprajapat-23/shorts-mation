import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function removeAssetPaths(paths: string[]) {
  if (!paths.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = [...new Set(paths.slice(i, i + 100).map((p) => p.replace(/^assets\//, "")).filter(Boolean))];
    if (!chunk.length) continue;
    const { error } = await supabaseAdmin.storage.from("assets").remove(chunk);
    if (error) throw new Error(`Could not remove orphan asset files: ${error.message}`);
  }
}

export const cleanupUnusedAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { olderThanDays?: number }) => d)
  .handler(async ({ data, context }) => {
    const days = Math.max(1, Math.min(365, Math.floor(data.olderThanDays ?? 7)));
    const { data: candidates, error } = await (context.supabase as any).rpc("list_unused_asset_candidates", { p_older_than_days: days });
    if (error) throw new Error(error.message);
    const rows = (candidates ?? []) as Array<{ id: string; storage_path: string | null; size: number | null }>;
    const paths = rows.map((r) => r.storage_path ?? "").filter(Boolean);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await (supabaseAdmin as any).from("assets").update({ lifecycle_status: "orphaned" }).eq("user_id", context.userId).in("id", ids);
      await removeAssetPaths(paths);
      const { error: deleteError } = await (supabaseAdmin as any).from("assets").delete().eq("user_id", context.userId).in("id", ids);
      if (deleteError) throw new Error(deleteError.message);
    }

    // Also remove true storage orphans: objects under the user's folder that
    // have no database asset row. A grace period prevents racing an upload
    // that has reached Storage but has not registered its DB row yet.
    const { data: registeredRows } = await (supabaseAdmin as any).from("assets").select("storage_path").eq("user_id", context.userId);
    const registered = new Set((registeredRows ?? []).map((r: any) => String(r.storage_path ?? "").replace(/^assets\//, "")).filter(Boolean));
    const cutoff = Date.now() - days * 86_400_000;
    const storageOrphans: string[] = [];
    for (let offset = 0; offset < 10_000; offset += 1000) {
      const listed = await supabaseAdmin.storage.from("assets").list(context.userId, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (listed.error) throw new Error(`Could not inspect asset storage: ${listed.error.message}`);
      for (const entry of listed.data ?? []) {
        const fullPath = `${context.userId}/${entry.name}`;
        const createdAt = Date.parse((entry as any).created_at ?? (entry as any).updated_at ?? "");
        if (!registered.has(fullPath) && (!Number.isFinite(createdAt) || createdAt < cutoff)) storageOrphans.push(fullPath);
      }
      if ((listed.data ?? []).length < 1000) break;
    }
    await removeAssetPaths(storageOrphans);
    return { removed: rows.length, storageOrphansRemoved: storageOrphans.length, bytesFreed: rows.reduce((sum, row) => sum + Number(row.size ?? 0), 0) };
  });

export const deleteAssetSafely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: asset, error } = await (context.supabase as any).from("assets").select("id,user_id,storage_path,usage_count").eq("id", data.assetId).single();
    if (error || !asset || asset.user_id !== context.userId) throw new Error("Asset not found");
    if (Number(asset.usage_count ?? 0) > 0) throw new Error(`Asset is used in ${asset.usage_count} place(s). Replace it everywhere before deleting.`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("assets").update({ lifecycle_status: "orphaned" }).eq("id", asset.id).eq("user_id", context.userId);
    if (asset.storage_path) await removeAssetPaths([asset.storage_path]);
    const { error: deleteError } = await (supabaseAdmin as any).from("assets").delete().eq("id", asset.id).eq("user_id", context.userId);
    if (deleteError) throw new Error(deleteError.message);
    return { deleted: true };
  });
