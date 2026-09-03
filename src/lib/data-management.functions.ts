import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function removePaths(bucket: "renders" | "assets", paths: string[]) {
  if (!paths.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = Array.from(new Set(paths.slice(i, i + 100).filter(Boolean)));
    if (!chunk.length) continue;
    const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(`Could not clean ${bucket} storage: ${error.message}`);
  }
}

export const deleteCampaignFully = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase.from("campaigns").select("id,user_id").eq("id", data.campaignId).single();
    if (error || !campaign || campaign.user_id !== context.userId) throw new Error("Campaign not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items } = await supabaseAdmin.from("campaign_items").select("rendered_video_url").eq("campaign_id", campaign.id);
    const paths = (items ?? []).map((i: any) => String(i.rendered_video_url ?? "")).filter((p: string) => p.startsWith(`${context.userId}/`));
    await removePaths("renders", paths);
    const { error: deleteError } = await supabaseAdmin.from("campaigns").delete().eq("id", campaign.id).eq("user_id", context.userId);
    if (deleteError) throw new Error(deleteError.message);
    return { deleted: true, renderFilesRemoved: paths.length };
  });

export const deleteAllAccountData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: items }, { data: assets }] = await Promise.all([
      supabaseAdmin.from("campaign_items").select("rendered_video_url").eq("user_id", context.userId),
      supabaseAdmin.from("assets").select("storage_path").eq("user_id", context.userId),
    ]);
    const renderPaths = (items ?? []).map((i: any) => String(i.rendered_video_url ?? "")).filter((p: string) => p.startsWith(`${context.userId}/`));
    const assetPaths = (assets ?? []).map((a: any) => String(a.storage_path ?? "").replace(/^assets\//, "")).filter((p: string) => p.startsWith(`${context.userId}/`));
    await removePaths("renders", renderPaths);
    await removePaths("assets", assetPaths);
    for (const table of ["campaigns", "templates", "assets", "youtube_connections"] as const) {
      const { error } = await (supabaseAdmin as any).from(table).delete().eq("user_id", context.userId);
      if (error && !/does not exist/i.test(error.message)) throw new Error(`${table}: ${error.message}`);
    }
    return { deleted: true, renderFilesRemoved: renderPaths.length, assetFilesRemoved: assetPaths.length };
  });
