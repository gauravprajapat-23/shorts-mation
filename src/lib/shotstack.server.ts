// Server-side MP4 rendering through Shotstack (a hosted FFmpeg render farm).
// The edge runtime cannot execute FFmpeg itself, so the timeline is built here
// from the campaign's template document and handed to Shotstack, which encodes
// the MP4 and hands back a download URL. No browser tab required.
import { effectiveSceneDurationMs, computeRevealDurationMs, resolveDocVars } from "@/lib/animate";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, EditorScene, TextElement, ShapeElement, ImageElement } from "@/lib/types";

const MAX_REVEAL_STEPS = 14;

function apiBase(): string {
  const env = process.env["SHOTSTACK_ENV"] || "v1";
  return `https://api.shotstack.io/edit/${env}`;
}

function apiKey(): string {
  const key = process.env["SHOTSTACK_API_KEY"];
  if (!key) throw new Error("Server rendering is not configured yet (missing render provider API key).");
  return key;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function revealParts(el: TextElement): string[] {
  const reveal = el.reveal ?? "none";
  const text = el.text ?? "";
  if (!text.trim() || reveal === "none") return [text];
  if (reveal === "wordByWord") {
    const words = text.trim().split(/\s+/);
    return words.map((_, i) => words.slice(0, i + 1).join(" "));
  }
  const chars = Array.from(text);
  return chars.map((_, i) => chars.slice(0, i + 1).join(""));
}

function sample(parts: string[], steps: number): string[] {
  if (parts.length <= steps) return parts;
  const out: string[] = [];
  for (let i = 0; i < steps; i++) out.push(parts[Math.round(((i + 1) / steps) * (parts.length - 1))]!);
  return out;
}

function elementHtml(el: EditorElement, textOverride?: string): string {
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;opacity:${el.opacity};transform:rotate(${el.rotation}deg);`;
  if (el.type === "shape") {
    const s = el as ShapeElement;
    const radius = s.shape === "ellipse" ? "50%" : `${s.radius ?? 0}px`;
    return `<div style="${base}background:${s.fill};border-radius:${radius};"></div>`;
  }
  if (el.type === "image") {
    const im = el as ImageElement;
    if (!im.src || im.src.startsWith("{{")) return "";
    return `<div style="${base}"><img src="${escapeHtml(im.src)}" style="width:100%;height:100%;object-fit:${im.fit === "contain" ? "contain" : "cover"};"/></div>`;
  }
  if (el.type === "text") {
    const t = el as TextElement;
    const txt = textOverride ?? t.text;
    if (!txt.trim()) return "";
    const justify = t.align === "left" ? "flex-start" : t.align === "right" ? "flex-end" : "center";
    return `<div style="${base}display:flex;align-items:center;justify-content:${justify};text-align:${t.align};"><span style="font-family:'${escapeHtml(t.fontFamily)}',sans-serif;font-size:${t.fontSize}px;font-weight:${t.fontWeight};color:${t.color};line-height:1.15;">${escapeHtml(txt)}</span></div>`;
  }
  return "";
}

function sceneHtml(scene: EditorScene, w: number, h: number, stepIndex: number, stepCount: number): string {
  const parts: string[] = [];
  for (const el of scene.elements) {
    if (el.type === "video") continue;
    if (el.type === "text") {
      const t = el as TextElement;
      const steps = sample(revealParts(t), MAX_REVEAL_STEPS);
      const idx = stepCount <= 1 ? steps.length - 1 : Math.min(steps.length - 1, Math.round((stepIndex / (stepCount - 1)) * (steps.length - 1)));
      parts.push(elementHtml(el, steps[idx]));
    } else {
      parts.push(elementHtml(el));
    }
  }
  return `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;">${parts.join("")}</div>`;
}

function sceneRevealSteps(scene: EditorScene): number {
  let steps = 1;
  for (const el of scene.elements) {
    if (el.type !== "text") continue;
    if (computeRevealDurationMs(el) <= 0) continue;
    steps = Math.max(steps, Math.min(MAX_REVEAL_STEPS, sample(revealParts(el as TextElement), MAX_REVEAL_STEPS).length));
  }
  return steps;
}

export type BuildOptions = {
  doc: EditorDocument;
  vars: Record<string, string>;
  backgroundVideoUrl?: string | null;
  audioUrl?: string | null;
  audioVolume?: number;
  resolution?: "720p" | "1080p";
  fps?: number;
};

/** Turns the editor document into a Shotstack edit payload. Scene text reveals
 *  become a series of short HTML clips so the word-by-word pacing survives. */
export function buildShotstackEdit(opts: BuildOptions) {
  const doc = resolveDocVars(opts.doc, opts.vars);
  const dims = CANVAS_DIMS[doc.aspect] ?? CANVAS_DIMS["9:16"];
  const scale = opts.resolution === "720p" ? 0.666 : 1;
  const outW = Math.round(dims.w * scale);
  const outH = Math.round(dims.h * scale);

  const clips: unknown[] = [];
  let cursor = 0;
  for (const scene of doc.scenes) {
    const durMs = effectiveSceneDurationMs(scene);
    const steps = sceneRevealSteps(scene);
    const revealMs = Math.min(durMs * 0.6, Math.max(...scene.elements.map((e) => computeRevealDurationMs(e)), 0));
    const stepMs = steps > 1 && revealMs > 0 ? revealMs / steps : 0;
    for (let i = 0; i < steps; i++) {
      const isLast = i === steps - 1;
      const length = isLast ? (durMs - stepMs * (steps - 1)) / 1000 : stepMs / 1000;
      if (length <= 0.02) continue;
      clips.push({
        asset: { type: "html", html: sceneHtml(scene, dims.w, dims.h, i, steps), width: dims.w, height: dims.h, background: "transparent" },
        start: cursor / 1000,
        length,
        fit: "none",
        scale,
        position: "center",
        ...(i === 0 && (scene.transitionIn ?? "fade") !== "cut" ? { transition: { in: "fade" } } : {}),
      });
      cursor += length * 1000;
    }
  }
  const totalSec = Math.max(1, cursor / 1000);

  const tracks: unknown[] = [{ clips }];
  const bgClips: unknown[] = [];
  if (opts.backgroundVideoUrl) {
    bgClips.push({ asset: { type: "video", src: opts.backgroundVideoUrl, volume: 0 }, start: 0, length: totalSec, fit: "crop", position: "center" });
  } else {
    const bg = doc.scenes[0]?.background ?? "#0A0A0A";
    bgClips.push({ asset: { type: "html", html: `<div style="width:${dims.w}px;height:${dims.h}px;background:${bg};"></div>`, width: dims.w, height: dims.h }, start: 0, length: totalSec, fit: "none", scale, position: "center" });
  }
  tracks.push({ clips: bgClips });

  return {
    timeline: {
      background: "#000000",
      ...(opts.audioUrl
        ? { soundtrack: { src: opts.audioUrl, effect: "fadeOut", volume: opts.audioVolume ?? doc.audio?.volume ?? 0.7 } }
        : {}),
      tracks,
    },
    output: { format: "mp4", fps: opts.fps ?? 25, size: { width: outW, height: outH } },
  };
}

export async function submitShotstackRender(edit: unknown): Promise<string> {
  const res = await fetch(`${apiBase()}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(edit),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Render provider rejected the job [${res.status}]: ${body}`);
  const json = JSON.parse(body) as { response?: { id?: string } };
  const id = json.response?.id;
  if (!id) throw new Error(`Render provider returned no job id: ${body}`);
  return id;
}

export type ShotstackStatus = { status: string; url: string | null; error: string | null };

export async function getShotstackRender(id: string): Promise<ShotstackStatus> {
  const res = await fetch(`${apiBase()}/render/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": apiKey() },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Render status check failed [${res.status}]: ${body}`);
  const json = JSON.parse(body) as { response?: { status?: string; url?: string; error?: string } };
  return {
    status: json.response?.status ?? "unknown",
    url: json.response?.url ?? null,
    error: json.response?.error ?? null,
  };
}

export function isServerRenderConfigured(): boolean {
  return Boolean(process.env["SHOTSTACK_API_KEY"]);
}