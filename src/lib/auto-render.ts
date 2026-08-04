// Browser-side automatic render pipeline. Picks up campaign items that are
// waiting for a video, renders the MP4 with ffmpeg.wasm (using the campaign's
// template + the row's CSV/JSON variables, plus any background video/music the
// user attached), uploads it to the `renders` bucket and marks the item
// `rendered` so the scheduled queue can upload it to YouTube — no manual
// "Render MP4" click required.
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, TextElement, VideoElement } from "@/lib/types";

type ItemRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  content_json: Record<string, unknown> | null;
  asset_json: Record<string, unknown> | null;
  audio_json: Record<string, unknown> | null;
  rendered_video_url: string | null;
};

export function varsFromContent(content: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(content ?? {})) {
    if (k.startsWith("_")) continue;
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

export function fallbackDocumentFromVars(vars: Record<string, string>): EditorDocument {
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
  const path = fileName.startsWith(`${userId}/`) ? fileName : null;
  let storagePath = path;
  if (!storagePath) {
    const { data } = await supabase
      .from("assets")
      .select("storage_path")
      .eq("file_name", fileName)
      .limit(1)
      .maybeSingle();
    storagePath = data?.storage_path ?? null;
  }
  if (!storagePath) return null;
  const clean = storagePath.replace(/^assets\//, "");
  const { data } = await supabase.storage.from("assets").createSignedUrl(clean, 60 * 20);
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
      } else return raw;
    }
  }
  return null;
}

export type AutoRenderResult = { rendered: number; failed: number; skipped: boolean };

/** Renders (at most `limit`) items that still have no video, for the signed-in
 *  user's active campaigns. Safe to call repeatedly — it claims each row by
 *  flipping its status to `rendering` first. */
export async function runAutoRenderPass(limit = 2, onProgress?: (pct: number, label: string) => void): Promise<AutoRenderResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { rendered: 0, failed: 0, skipped: true };
  const userId = u.user.id;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, template_id, settings_json, status")
    .eq("user_id", userId)
    .eq("status", "active");
  const activeCampaigns = campaigns ?? [];
  if (activeCampaigns.length === 0) return { rendered: 0, failed: 0, skipped: true };

  const nowIso = new Date().toISOString();
  const { data: rows } = await supabase
    .from("campaign_items")
    .select("id, campaign_id, user_id, status, content_json, asset_json, audio_json, rendered_video_url")
    .eq("user_id", userId)
    .in("campaign_id", activeCampaigns.map((c) => c.id))
    .in("status", ["pending", "upload_pending"])
    .is("rendered_video_url", null)
    // Never fight the backend renderer: skip rows it already claimed, and stay
    // inside the same staggered render window so the load is spread out.
    .is("render_job_ref", null)
    .or(`render_due_at.is.null,render_due_at.lte.${nowIso}`)
    .order("schedule_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  const items = (rows ?? []) as unknown as ItemRow[];
  let rendered = 0;
  let failed = 0;

  for (const item of items) {
    const campaign = activeCampaigns.find((c) => c.id === item.campaign_id);
    try {
      // Claim the row so a second tab doesn't render it too.
      const { data: claimed } = await supabase
        .from("campaign_items")
        .update({ status: "rendering", error_message: null })
        .eq("id", item.id)
        .in("status", ["pending", "upload_pending"])
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      const vars = varsFromContent(item.content_json);
      let doc: EditorDocument | null = null;
      if (campaign?.template_id) {
        const { data: tpl } = await supabase
          .from("templates")
          .select("template_json")
          .eq("id", campaign.template_id)
          .maybeSingle();
        doc = (tpl?.template_json ?? null) as EditorDocument | null;
      }
      if (!doc?.scenes?.length) doc = fallbackDocumentFromVars(vars);

      const asset = (item.asset_json ?? {}) as { background_file_name?: string };
      const audio = (item.audio_json ?? {}) as { audio_file_name?: string; volume?: number };
      const bgFromAsset = await signAsset(userId, asset.background_file_name);
      const backgroundVideoUrl = bgFromAsset ?? backgroundFromDoc(doc, vars);
      const audioUrl = await signAsset(userId, audio.audio_file_name);

      const { renderMp4 } = await import("@/lib/ffmpeg-render");
      const blob = await renderMp4({
        backgroundVideoUrl,
        audioUrl,
        audioVolume: audio.volume ?? doc.audio?.volume ?? 0.7,
        doc,
        vars,
        fps: 20,
        resolution: "1080p",
        quality: "standard",
        muted: !audioUrl,
        loop: true,
        onProgress: (pct) => onProgress?.(pct, item.id),
      });

      const path = `${userId}/${item.id}-${Date.now()}.mp4`;
      const { error: upErr } = await supabase.storage.from("renders").upload(path, blob, {
        contentType: "video/mp4",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("campaign_items")
        .update({ rendered_video_url: path, status: "rendered", error_message: null })
        .eq("id", item.id);
      if (updErr) throw updErr;
      rendered++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : "Auto render failed";
      await supabase
        .from("campaign_items")
        .update({ status: "pending", error_message: msg })
        .eq("id", item.id);
    }
  }

  return { rendered, failed, skipped: false };
}