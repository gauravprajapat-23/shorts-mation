// Backend render pipeline. Runs from the cron hook, so MP4s are produced and
// stored without the website being open:
//   1. submitDueRenders()  — sends jobs to the render provider, but only for
//      videos whose render lead time (60 min before publish) has arrived, and
//      only a few per tick, so the queue is spread out instead of bursting.
//   2. collectFinishedRenders() — downloads finished MP4s into Supabase
//      Storage (`renders` bucket) and marks the item `rendered`.
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, TextElement, VideoElement } from "@/lib/types";
import { buildShotstackEdit, submitShotstackRender, getShotstackRender, isServerRenderConfigured } from "@/lib/shotstack.server";

export const RENDER_LEAD_MINUTES = 60;
export const UPLOAD_LEAD_MINUTES = 20;
const SUBMIT_PER_TICK = 3;
const COLLECT_PER_TICK = 6;
const SIGN_TTL_SECONDS = 60 * 60 * 6;

function varsFromContent(content: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((content ?? {}) as Record<string, unknown>)) {
    if (k.startsWith("_")) continue;
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

function fallbackDocument(vars: Record<string, string>): EditorDocument {
  const dims = CANVAS_DIMS["9:16"];
  const entries = Object.entries(vars).filter(([, v]) => String(v ?? "").trim()).slice(0, 3);
  const elements: TextElement[] = entries.map(([key, value], i) => ({
    id: `auto_${key}`,
    type: "text",
    x: 80,
    y: 420 + i * 420,
    w: dims.w - 160,
    h: 340,
    rotation: 0,
    opacity: 1,
    locked: false,
    text: value,
    fontSize: i === 0 ? 96 : 64,
    fontWeight: i === 0 ? 800 : 600,
    fontFamily: "Inter",
    color: "#FFFFFF",
    align: "center",
    reveal: "wordByWord",
    animations: { in: { type: "fade", delayMs: 200 * i, durationMs: 500 } },
  }));
  return {
    version: 1,
    aspect: "9:16",
    scenes: [{ id: "auto_scene", name: "Auto", durationMs: 6000, background: "#0A0A0A", elements }],
    audio: { volume: 0.7 },
    variables: Object.keys(vars),
  };
}

async function signAsset(userId: string, fileName?: string | null): Promise<string | null> {
  if (!fileName) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let path: string | null = fileName.startsWith(`${userId}/`) ? fileName : null;
  if (!path) {
    const { data } = await supabaseAdmin
      .from("assets")
      .select("storage_path")
      .eq("user_id", userId)
      .eq("file_name", fileName)
      .limit(1)
      .maybeSingle();
    path = data?.storage_path ?? null;
  }
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from("assets").createSignedUrl(path.replace(/^assets\//, ""), SIGN_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

function backgroundFromDoc(doc: EditorDocument, vars: Record<string, string>): string | null {
  for (const s of doc.scenes) {
    for (const el of s.elements) {
      if (el.type !== "video") continue;
      const raw = (el as VideoElement).src;
      if (!raw) continue;
      if (raw.startsWith("{{")) {
        const key = raw.replace(/[{}\s]/g, "");
        if (vars[key]) return vars[key];
      } else if (/^https:\/\//i.test(raw)) return raw;
    }
  }
  return null;
}

async function log(row: { user_id: string; campaign_id: string; id: string }, level: "info" | "warn" | "error", message: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("automation_logs").insert({
    user_id: row.user_id,
    campaign_id: row.campaign_id,
    campaign_item_id: row.id,
    level,
    message,
    metadata_json: {} as never,
  });
}

export async function submitDueRenders(): Promise<{ submitted: number; errors: number; skipped?: string }> {
  if (!isServerRenderConfigured()) return { submitted: 0, errors: 0, skipped: "render provider not configured" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: rows } = await supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, content_json, asset_json, audio_json, schedule_at, campaigns!inner(status, template_id, settings_json)")
    .in("status", ["pending", "upload_pending"])
    .is("rendered_video_url", null)
    .is("render_job_ref", null)
    .not("render_due_at", "is", null)
    .lte("render_due_at", nowIso)
    .order("render_due_at", { ascending: true })
    .limit(SUBMIT_PER_TICK);

  let submitted = 0, errors = 0;
  for (const row of (rows ?? []) as any[]) {
    if (row.campaigns?.status !== "active") continue;
    try {
      const claim = await supabaseAdmin
        .from("campaign_items")
        .update({ status: "rendering", error_message: null, render_submitted_at: new Date().toISOString(), render_provider: "shotstack" })
        .eq("id", row.id)
        .is("render_job_ref", null)
        .in("status", ["pending", "upload_pending"])
        .select("id");
      if (!claim.data?.length) continue;

      const vars = varsFromContent(row.content_json);
      let doc: EditorDocument | null = null;
      if (row.campaigns?.template_id) {
        const { data: tpl } = await supabaseAdmin.from("templates").select("template_json").eq("id", row.campaigns.template_id).maybeSingle();
        doc = (tpl?.template_json ?? null) as EditorDocument | null;
      }
      if (!doc?.scenes?.length) doc = fallbackDocument(vars);

      const asset = (row.asset_json ?? {}) as { background_file_name?: string };
      const audio = (row.audio_json ?? {}) as { audio_file_name?: string; volume?: number };
      const backgroundVideoUrl = (await signAsset(row.user_id, asset.background_file_name)) ?? backgroundFromDoc(doc, vars);
      const audioUrl = await signAsset(row.user_id, audio.audio_file_name);

      const edit = buildShotstackEdit({
        doc,
        vars,
        backgroundVideoUrl,
        audioUrl,
        audioVolume: audio.volume ?? doc.audio?.volume ?? 0.7,
        resolution: "1080p",
        fps: 25,
      });
      const jobId = await submitShotstackRender(edit);
      await supabaseAdmin.from("campaign_items").update({ render_job_ref: jobId }).eq("id", row.id);
      await log(row, "info", `Server render submitted (job ${jobId})`);
      submitted++;
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : "Server render submit failed";
      await supabaseAdmin.from("campaign_items").update({ status: "pending", render_job_ref: null, error_message: msg }).eq("id", row.id);
      await log(row, "error", msg);
    }
  }
  return { submitted, errors };
}

export async function collectFinishedRenders(): Promise<{ completed: number; pending: number; errors: number }> {
  if (!isServerRenderConfigured()) return { completed: 0, pending: 0, errors: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, render_job_ref")
    .not("render_job_ref", "is", null)
    .is("rendered_video_url", null)
    .limit(COLLECT_PER_TICK);

  let completed = 0, pending = 0, errors = 0;
  for (const row of (rows ?? []) as any[]) {
    try {
      const status = await getShotstackRender(row.render_job_ref as string);
      if (status.status === "failed") {
        throw new Error(status.error || "Render provider reported a failed render");
      }
      if (status.status !== "done" || !status.url) { pending++; continue; }

      const res = await fetch(status.url);
      if (!res.ok) throw new Error(`Could not download the finished MP4 [${res.status}]`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.byteLength) throw new Error("The finished MP4 was empty");
      const path = `${row.user_id}/${row.id}-${Date.now()}.mp4`;
      const up = await supabaseAdmin.storage.from("renders").upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (up.error) throw up.error;

      await supabaseAdmin
        .from("campaign_items")
        .update({ rendered_video_url: path, status: "rendered", error_message: null })
        .eq("id", row.id);
      await log(row, "info", "Server render finished and stored");
      completed++;
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : "Server render failed";
      await supabaseAdmin
        .from("campaign_items")
        .update({ status: "pending", render_job_ref: null, error_message: msg })
        .eq("id", row.id);
      await log(row, "error", msg);
    }
  }
  return { completed, pending, errors };
}