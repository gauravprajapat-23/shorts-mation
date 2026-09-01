import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EditorDocument, TextElement } from "@/lib/types";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import { parseEditorDocument } from "@/lib/editor-document-schema";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import { evaluateTimelineFrame } from "@/lib/timeline-engine";

function varsFromContent(content: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((content ?? {}) as Record<string, unknown>)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

function fallbackDocumentFromVars(vars: Record<string, unknown>): EditorDocument {
  const dims = CANVAS_DIMS["9:16"];
  const entries = Object.entries(vars).filter(([, value]) => String(value ?? "").trim()).slice(0, 3);
  const elements: TextElement[] = entries.map(([key, value], index) => ({
    id: `fallback_${key}`, type: "text", x: 80, y: 520 + index * 360, w: dims.w - 160, h: 260,
    rotation: 0, opacity: 1, text: String(value), fontFamily: "Inter", fontSize: index === 0 ? 96 : 60,
    fontWeight: index === 0 ? 900 : 700, color: "#FFFFFF", align: "center",
  }));
  return { version: 1, aspect: "9:16", variables: entries.map(([key]) => key), scenes: [{ id: "fallback", name: "Preview", durationMs: 6000, background: "#0A0A0A", elements }] };
}

function previewDataUrl(doc: EditorDocument, vars: Record<string, string>): string {
  const svg = buildSceneSvgAtTime({ doc, tMs: 0, vars, includeBackground: true, includeVideo: true });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadConcreteDocument(supabase: any, templateId: string | null, content: unknown) {
  const rawVars = varsFromContent(content);
  let source: EditorDocument | null = null;
  if (templateId) {
    const { data: template } = await supabase.from("templates").select("template_json").eq("id", templateId).maybeSingle();
    if (template?.template_json) source = parseEditorDocument(template.template_json);
  }
  source ??= fallbackDocumentFromVars(rawVars);
  const concrete = materializeAutomationDocument(source, rawVars);
  if (concrete.errors.length) {
    throw new Error(`Automation input validation failed: ${concrete.errors.map((e) => `${e.variable}: ${e.message}`).join("; ")}`);
  }
  // Force canonical timeline evaluation now so malformed timing fails at the boundary.
  const frame = evaluateTimelineFrame(concrete.document, 0, concrete.values);
  return { doc: concrete.document, vars: concrete.values, durationMs: frame.durationMs };
}

export const startRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; campaignItemId?: string | null; renderOptions?: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign, error: cErr } = await supabase.from("campaigns").select("id,user_id,template_id").eq("id", data.campaignId).single();
    if (cErr || !campaign || campaign.user_id !== userId) throw new Error("Campaign not found");
    const itemQuery = supabase.from("campaign_items").select("id,user_id,content_json,seo_json");
    const result = data.campaignItemId
      ? await itemQuery.eq("id", data.campaignItemId).eq("campaign_id", data.campaignId).single()
      : await itemQuery.eq("campaign_id", data.campaignId).order("created_at").limit(1).single();
    const item = result.data;
    if (!item || item.user_id !== userId) throw new Error("Campaign item not found");
    const concrete = await loadConcreteDocument(supabase, campaign.template_id, item.content_json);
    const { data: inserted, error } = await supabase.from("render_jobs").insert({
      user_id: userId, campaign_id: data.campaignId, campaign_item_id: item.id, template_id: campaign.template_id,
      status: "rendering", progress: 0, total_ms: Math.max(250, concrete.durationMs),
      input_vars: varsFromContent(item.content_json) as never, render_options: (data.renderOptions ?? {}) as never,
    }).select("id").single();
    if (error) throw error;
    return { jobId: inserted.id };
  });

export const pollRenderJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error } = await supabase.from("render_jobs").select("*").eq("id", data.jobId).single();
    if (error || !job || job.user_id !== userId) throw new Error("Job not found");
    if (job.status === "completed" || job.status === "failed") return job;
    const elapsed = Date.now() - new Date(job.started_at).getTime();
    const totalMs = Math.max(250, job.total_ms || 250);
    const pct = Math.min(99, Math.floor((elapsed / totalMs) * 100));
    if (elapsed >= totalMs) {
      const { data: item } = job.campaign_item_id
        ? await supabase.from("campaign_items").select("content_json").eq("id", job.campaign_item_id).maybeSingle()
        : { data: null };
      const concrete = await loadConcreteDocument(supabase, job.template_id, item?.content_json ?? job.input_vars);
      const preview = previewDataUrl(concrete.doc, concrete.vars);
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
