import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const cancelRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("cancel_render_item", { p_item_id: data.itemId });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

export const recoverDeadLetterRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("recover_dead_letter_render", { p_item_id: data.itemId });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

export const setRenderPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { itemId: string; priority: number }) => d)
  .handler(async ({ data, context }) => {
    const priority = Math.max(0, Math.min(100, Math.round(data.priority)));
    const { error } = await context.supabase.from("campaign_items").update({ render_priority: priority } as never).eq("id", data.itemId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, priority };
  });
