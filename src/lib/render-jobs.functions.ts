import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EditorDocument, EditorElement, TextElement, ShapeElement, ImageElement } from "@/lib/types";
import { renderText } from "@/lib/editor-defaults";

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function renderSceneSvg(doc: EditorDocument, vars: Record<string, string>): string {
  const dims = doc.aspect === "9:16" ? { w: 1080, h: 1920 } : doc.aspect === "16:9" ? { w: 1920, h: 1080 } : { w: 1080, h: 1080 };
  const scene = doc.scenes[0];
  if (!scene) return "";
  const parts: string[] = [];
  parts.push(`<rect width="${dims.w}" height="${dims.h}" fill="${scene.background ?? "#0a0a0a"}"/>`);
  for (const el of scene.elements as EditorElement[]) {
    const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.w / 2} ${el.h / 2})`;
    if (el.type === "shape") {
      const s = el as ShapeElement;
      if (s.shape === "ellipse") {
        parts.push(`<g transform="${transform}" opacity="${el.opacity}"><ellipse cx="${s.w / 2}" cy="${s.h / 2}" rx="${s.w / 2}" ry="${s.h / 2}" fill="${s.fill}"/></g>`);
      } else {
        parts.push(`<g transform="${transform}" opacity="${el.opacity}"><rect width="${s.w}" height="${s.h}" fill="${s.fill}" rx="${s.radius ?? 0}"/></g>`);
      }
    } else if (el.type === "text") {
      const t = el as TextElement;
      const txt = escapeXml(renderText(t.text, vars));
      const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
      const xPos = t.align === "left" ? 0 : t.align === "right" ? t.w : t.w / 2;
      parts.push(`<g transform="${transform}" opacity="${el.opacity}"><text x="${xPos}" y="${t.h / 2}" dominant-baseline="middle" text-anchor="${anchor}" fill="${t.color}" font-family="${escapeXml(t.fontFamily)}" font-size="${t.fontSize}" font-weight="${t.fontWeight}">${txt}</text></g>`);
    } else if (el.type === "image") {
      const im = el as ImageElement;
      const src = im.src.startsWith("{{") ? "" : im.src;
      if (src) parts.push(`<g transform="${transform}" opacity="${el.opacity}"><image href="${escapeXml(src)}" width="${im.w}" height="${im.h}" preserveAspectRatio="${im.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/></g>`);
    }
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}">${parts.join("")}</svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

export const startRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; campaignItemId?: string | null; renderOptions?: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error: cErr } = await supabase.from("campaigns").select("*").eq("id", data.campaignId).single();
    if (cErr || !campaign) throw new Error("Campaign not found");
    let item = null as null | { id: string; content_json: unknown; seo_json: unknown };
    if (data.campaignItemId) {
      const r = await supabase.from("campaign_items").select("id, content_json, seo_json").eq("id", data.campaignItemId).single();
      item = r.data ?? null;
    } else {
      const r = await supabase.from("campaign_items").select("id, content_json, seo_json").eq("campaign_id", data.campaignId).order("created_at").limit(1).single();
      item = r.data ?? null;
    }
    const content = (item?.content_json ?? {}) as Record<string, unknown>;
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(content)) if (!k.startsWith("_")) vars[k] = v == null ? "" : String(v);
    const { data: inserted, error } = await supabase.from("render_jobs").insert({
      user_id: userId,
      campaign_id: data.campaignId,
      campaign_item_id: item?.id ?? null,
      template_id: campaign.template_id,
      status: "rendering",
      progress: 0,
      total_ms: 6000,
      input_vars: vars,
      render_options: (data.renderOptions ?? {}) as never,
    }).select("id").single();
    if (error) throw error;
    return { jobId: inserted.id };
  });

export const pollRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase.from("render_jobs").select("*").eq("id", data.jobId).single();
    if (error || !job) throw new Error("Job not found");
    if (job.status === "completed" || job.status === "failed") return job;
    const elapsed = Date.now() - new Date(job.started_at).getTime();
    const pct = Math.min(99, Math.floor((elapsed / job.total_ms) * 100));
    if (elapsed >= job.total_ms) {
      // finalize: render the SVG preview from the template
      const { data: tmpl } = await supabase.from("templates").select("template_json").eq("id", job.template_id!).single();
      const doc = tmpl?.template_json as EditorDocument | undefined;
      const preview = doc ? renderSceneSvg(doc, (job.input_vars ?? {}) as Record<string, string>) : null;
      const { data: updated } = await supabase.from("render_jobs").update({
        status: "completed", progress: 100, preview_url: preview, thumbnail_url: preview, finished_at: new Date().toISOString(),
      }).eq("id", job.id).select("*").single();
      return updated ?? job;
    }
    if (pct !== job.progress) {
      const { data: updated } = await supabase.from("render_jobs").update({ progress: pct }).eq("id", job.id).select("*").single();
      return updated ?? job;
    }
    return job;
  });