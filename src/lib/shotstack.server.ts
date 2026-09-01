// Server-side MP4 rendering through Shotstack (a hosted FFmpeg render farm).
// The edge runtime cannot execute FFmpeg itself, so the timeline is built here
// from the campaign's template document and handed to Shotstack, which encodes
// the MP4 and hands back a download URL. No browser tab required.
import { computeRevealDurationMs, resolveDocVars } from "@/lib/animate";
import { collectTimelineAudioSegments, collectTimelineVideoSegments, evaluateTimelineAudio, evaluateTimelineFrame, getTimelineSceneRanges, timelineDurationMs } from "@/lib/timeline-engine";
import type { ElementFrame } from "@/lib/animate";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, EditorScene, TextElement, ShapeElement, ImageElement, EditorCaptionClip } from "@/lib/types";
import { cssTextShadows, gradientCss, layoutText } from "@/lib/text-design";
import { cssFilterForLook, resolveMediaLook } from "@/lib/effects";

const MAX_REVEAL_STEPS = 14;

export type RenderCredentials = { key: string; env: string };

export function apiBase(env?: string): string {
  const e = env || process.env["SHOTSTACK_ENV"] || "v1";
  return `https://api.shotstack.io/edit/${e}`;
}

function creds(input?: RenderCredentials | null): RenderCredentials {
  const key = input?.key || process.env["SHOTSTACK_API_KEY"] || "";
  if (!key) throw new Error("Server rendering is not configured yet (missing render provider API key).");
  return { key, env: input?.env || process.env["SHOTSTACK_ENV"] || "v1" };
}

/** Cheap authenticated GET used to verify a key the user just pasted. */
export async function verifyShotstackKey(input: RenderCredentials): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiBase(input.env)}/templates`, { headers: { "x-api-key": input.key } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "The render provider rejected this API key." };
    if (!res.ok) return { ok: false, error: `Render provider responded ${res.status}. Check the environment (v1 vs stage).` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the render provider" };
  }
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

function elementHtml(el: EditorElement, frame: ElementFrame, textOverride?: string): string {
  const base = `position:absolute;left:${frame.x}px;top:${frame.y}px;width:${el.w}px;height:${el.h}px;opacity:${frame.opacity};transform:scale(${frame.scale}) rotate(${frame.rotation}deg);transform-origin:center center;overflow:hidden;${frame.blurPx > 0.1 ? `filter:blur(${frame.blurPx}px);` : ""}`;
  if (el.type === "shape") {
    const s = el as ShapeElement;
    const radius = s.shape === "ellipse" ? "50%" : `${s.radius ?? 0}px`;
    return `<div style="${base}background:${s.fill};border-radius:${radius};"></div>`;
  }
  if (el.type === "image") {
    const im = el as ImageElement;
    if (!im.src || im.src.startsWith("{{")) return "";
    const look = resolveMediaLook(im.filterPreset, im.colorAdjustments);
    return `<div style="${base}"><img src="${escapeHtml(im.src)}" style="width:100%;height:100%;object-fit:${im.fit === "contain" ? "contain" : "cover"};filter:${cssFilterForLook(look)};transform:translate(${frame.cropX}%,${frame.cropY}%) scale(${frame.cropScale});transform-origin:center center;"/></div>`;
  }
  if (el.type === "text") {
    const t = el as TextElement;
    let txt = textOverride ?? t.text;
    if (!txt.trim()) return "";
    if (t.textTransform === "uppercase") txt = txt.toUpperCase();
    else if (t.textTransform === "lowercase") txt = txt.toLowerCase();
    const layout = layoutText(t, txt);
    const justify = t.align === "left" ? "flex-start" : t.align === "right" ? "flex-end" : "center";
    const valign = t.vAlign === "top" ? "flex-start" : t.vAlign === "bottom" ? "flex-end" : "center";
    const background = t.backgroundGradient ? gradientCss(t.backgroundGradient) : (t.background || "transparent");
    const textFill = t.textGradient ? gradientCss(t.textGradient) : undefined;
    const stroke = t.stroke ? `-webkit-text-stroke:${t.strokeWidth ?? 6}px ${t.stroke};paint-order:stroke fill;` : "";
    const shadow = cssTextShadows(t);
    const textStyle = t.textGradient
      ? `background:${textFill};background-clip:text;-webkit-background-clip:text;color:transparent;`
      : `color:${t.color};`;
    const lines = layout.lines.map(escapeHtml).join("<br/>");
    const radius = t.backgroundRadius ?? (t.background || t.backgroundGradient ? 12 : 0);
    const border = (t.backgroundBorderWidth ?? 0) > 0 ? `border:${t.backgroundBorderWidth}px solid ${t.backgroundBorderColor ?? "#FFFFFF"};` : "";
    return `<div style="${base}box-sizing:border-box;display:flex;align-items:${valign};justify-content:${justify};text-align:${t.align};padding:${t.backgroundPaddingY ?? 8}px ${t.backgroundPaddingX ?? 8}px;border-radius:${radius}px;overflow:hidden;"><div style="position:absolute;inset:0;background:${background};opacity:${t.backgroundOpacity ?? 1};border-radius:${radius}px;${border}"></div><span style="position:relative;font-family:'${escapeHtml(t.fontFamily)}',sans-serif;font-size:${layout.fontSize}px;font-weight:${t.fontWeight};line-height:${t.lineHeight ?? 1.15};letter-spacing:${t.letterSpacing ?? 0}px;${t.italic ? "font-style:italic;" : ""}${textStyle}${stroke}${shadow ? `text-shadow:${shadow};` : ""}">${lines}</span></div>`;
  }
  return "";
}

function sceneHtml(doc: EditorDocument, tMs: number, w: number, h: number): string {
  const frame = evaluateTimelineFrame(doc, tMs);
  const parts: string[] = [];
  for (const state of frame.visibleElements) {
    const el = state.element;
    if (el.type === "video") continue;
    if (el.type === "text") {
      const text = el.text ?? "";
      const shown = state.frame.visibleChars !== undefined
        ? text.slice(0, state.frame.visibleChars)
        : state.frame.visibleWords !== undefined
          ? text.split(/\s+/).slice(0, state.frame.visibleWords).join(" ")
          : text;
      parts.push(elementHtml(el, state.frame, shown));
    } else {
      parts.push(elementHtml(el, state.frame));
    }
  }
  const cam = frame.camera; const tr = frame.transition;
  const effects = frame.visibleEffects.map((fx) => {
    const o = Math.max(0,Math.min(1,(fx.opacity??1)*fx.intensity));
    if (fx.kind === "vignette") return `<div style="position:absolute;inset:0;background:radial-gradient(circle at center,transparent 42%,rgba(0,0,0,.92) 100%);opacity:${o};"></div>`;
    if (fx.kind === "light-leak") return `<div style="position:absolute;inset:0;background:radial-gradient(circle at ${20+60*fx.progress}% 15%,${fx.color??"#FF7A18"},transparent 38%);opacity:${o};mix-blend-mode:screen;"></div>`;
    if (fx.kind === "flash") return `<div style="position:absolute;inset:0;background:#fff;opacity:${o*Math.sin(fx.progress*Math.PI)};"></div>`;
    if (fx.kind === "grain") return `<div style="position:absolute;inset:0;opacity:${o*.22};background-image:repeating-radial-gradient(circle at 20% 30%,#fff 0 1px,transparent 1px 3px);mix-blend-mode:overlay;"></div>`;
    return `<div style="position:absolute;inset:0;opacity:${o*.4};background:repeating-linear-gradient(0deg,rgba(255,0,90,.4) 0 2px,rgba(0,230,255,.3) 2px 4px,transparent 4px 8px);mix-blend-mode:screen;"></div>`;
  }).join("");
  const flash = tr.flash > .001 ? `<div style="position:absolute;inset:0;background:#fff;opacity:${tr.flash};"></div>` : "";
  return `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;"><div style="position:absolute;inset:0;transform-origin:center center;transform:translate(${cam.tx+tr.tx}px,${cam.ty+tr.ty}px) scale(${cam.scale*tr.scale});opacity:${tr.opacity};filter:${tr.blur>0.1?`blur(${tr.blur}px)`:"none"};">${parts.join("")}</div>${effects}${flash}</div>`;
}


function captionHtml(clip: EditorCaptionClip, localMs: number): string {
  const style = clip.style;
  const words = clip.words.map((word) => {
    const active = localMs >= word.startMs && localMs < word.endMs;
    const spoken = localMs >= word.endMs;
    const opacity = style.animation === "karaoke" && !spoken && !active ? 0.58 : 1;
    const progress = Math.max(0, Math.min(1, (localMs - word.startMs) / Math.max(1, word.endMs - word.startMs)));
    const scale = style.animation === "pop" && active ? 1 + 0.16 * Math.sin(progress * Math.PI) : 1;
    const text = style.uppercase ? word.text.toUpperCase() : word.text;
    return `<span style="display:inline-block;margin:0 .14em;color:${active ? style.activeColor : style.color};opacity:${opacity};transform:scale(${scale});transform-origin:center;">${escapeHtml(text)}</span>`;
  }).join("");
  const stroke = style.stroke ? `-webkit-text-stroke:${style.strokeWidth ?? 5}px ${style.stroke};paint-order:stroke fill;` : "";
  return `<div style="position:relative;width:${clip.w}px;height:${clip.h}px;display:flex;align-items:center;justify-content:center;align-content:center;flex-wrap:wrap;text-align:center;padding:${style.padding ?? 14}px;box-sizing:border-box;border-radius:${style.radius ?? 12}px;background:${style.background};font-family:'${escapeHtml(style.fontFamily)}',sans-serif;font-size:${style.fontSize}px;font-weight:${style.fontWeight};line-height:1.08;${stroke}">${words}</div>`;
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

function shotstackFilterForPreset(preset?: import("@/lib/types").MediaFilterPreset): string | undefined {
  switch (preset) {
    case "mono": return "greyscale"; case "high-contrast": return "contrast"; case "gaming": case "cinematic": return "boost";
    case "vintage": case "podcast": case "documentary": return "muted"; default: return undefined;
  }
}

export type BuildOptions = {
  doc: EditorDocument;
  vars: Record<string, string>;
  backgroundVideoUrl?: string | null;
  audioUrl?: string | null;
  audioVolume?: number;
  resolution?: "720p" | "1080p";
  fps?: number;
  callbackUrl?: string | null;
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
  const ranges = getTimelineSceneRanges(doc);
  for (const range of ranges) {
    const revealSteps = sceneRevealSteps(range.scene);
    const motionSteps = Math.max(1, Math.min(24, Math.ceil(range.durationMs / 500)));
    const steps = Math.max(revealSteps, motionSteps);
    const stepMs = range.durationMs / steps;
    for (let i = 0; i < steps; i++) {
      const startMs = range.startMs + i * stepMs;
      const lengthMs = i === steps - 1 ? range.endMs - startMs : stepMs;
      if (lengthMs <= 20) continue;
      clips.push({
        asset: { type: "html", html: sceneHtml(doc, startMs + Math.min(1, lengthMs / 2), dims.w, dims.h), width: dims.w, height: dims.h, background: "transparent" },
        start: startMs / 1000,
        length: lengthMs / 1000,
        fit: "none",
        scale,
        position: "center",
        ...(i === 0 && (range.scene.transitionIn ?? "fade") !== "cut" ? { transition: { in: "fade" } } : {}),
      });
    }
  }
  const totalSec = Math.max(1, timelineDurationMs(doc) / 1000);

  const tracks: unknown[] = [{ clips }];

  // V2.6 professional caption clips. Word boundaries become short HTML clips,
  // preserving active-word highlight/karaoke/pop timing in server renders.
  if (doc.version === 2) {
    for (const caption of (doc.captionClips ?? []).slice().reverse()) {
      if (caption.hidden || !caption.words.length || caption.durationMs <= 0) continue;
      const boundaries = new Set<number>([0, caption.durationMs]);
      for (const word of caption.words) { boundaries.add(Math.max(0, word.startMs)); boundaries.add(Math.min(caption.durationMs, word.endMs)); }
      const points = [...boundaries].filter((n) => n >= 0 && n <= caption.durationMs).sort((a, b) => a - b);
      const captionClips: unknown[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const localStart = points[i]!; const localEnd = points[i + 1]!;
        if (localEnd - localStart < 10) continue;
        const sampleMs = localStart + (localEnd - localStart) / 2;
        captionClips.push({
          asset: { type: "html", html: captionHtml(caption, sampleMs), width: caption.w, height: caption.h, background: "transparent" },
          start: (caption.startMs + localStart) / 1000,
          length: (localEnd - localStart) / 1000,
          fit: "none", scale, position: "topLeft",
          offset: { x: caption.x / dims.w, y: -(caption.y / dims.h) },
        });
      }
      if (captionClips.length) tracks.unshift({ clips: captionClips });
    }
  }

  // Timeline video elements are real Shotstack video assets now (previously
  // skipped). The shared engine supplies project start/length and source trim.
  for (const segment of collectTimelineVideoSegments(doc).slice().reverse()) {
    const el = segment.element;
    tracks.push({ clips: [{
      asset: {
        type: "video",
        src: el.src,
        trim: segment.sourceStartMs / 1000,
        speed: segment.playbackRate,
        volume: segment.muted ? 0 : segment.volume,
      },
      start: segment.startMs / 1000,
      length: segment.durationMs / 1000,
      fit: el.fit === "contain" ? "contain" : "crop",
      width: Math.max(1, Math.round(el.w * scale * segment.frame.scale)),
      height: Math.max(1, Math.round(el.h * scale * segment.frame.scale)),
      position: "topLeft",
      offset: { x: (segment.frame.x - (el.w * (segment.frame.scale - 1) / 2)) / dims.w, y: -((segment.frame.y - (el.h * (segment.frame.scale - 1) / 2)) / dims.h) },
      opacity: Math.max(0, Math.min(1, segment.frame.opacity)),
      ...(shotstackFilterForPreset(el.filterPreset) ? { filter: shotstackFilterForPreset(el.filterPreset) } : {}),
    }] });
  }

  // V2.5 project audio clips. We split clips at fade/ducking boundaries so
  // Shotstack receives the same time-varying gain envelope as editor preview.
  const audioSegments = collectTimelineAudioSegments(doc);
  if (doc.version === 2 && audioSegments.length) {
    const voiceBoundaries = doc.audioClips.filter((clip) => clip.role === "voiceover" && !clip.muted).flatMap((clip) => {
      const mix = doc.audioMix;
      return [
        Math.max(0, clip.startMs - mix.attackMs),
        clip.startMs,
        clip.startMs + clip.durationMs,
        clip.startMs + clip.durationMs + mix.releaseMs,
      ];
    });
    for (const segment of audioSegments) {
      const clip = segment.clip;
      const audioClips: unknown[] = [];
      const points = new Set<number>([segment.startMs, segment.endMs]);
      if (clip.fadeInMs) points.add(Math.min(segment.endMs, segment.startMs + clip.fadeInMs));
      if (clip.fadeOutMs) points.add(Math.max(segment.startMs, segment.endMs - clip.fadeOutMs));
      if (clip.role === "music" && clip.ducking !== false && doc.audioMix.duckingEnabled) {
        for (const point of voiceBoundaries) if (point > segment.startMs && point < segment.endMs) points.add(point);
      }
      const sorted = [...points].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const startMs = sorted[i]!;
        const endMs = sorted[i + 1]!;
        if (endMs - startMs < 10) continue;
        const midMs = startMs + (endMs - startMs) / 2;
        const state = evaluateTimelineAudio(doc, midMs).find((item) => item.clip.id === clip.id);
        if (!state || state.gain <= 0.0001) continue;
        const sourceAtStart = segment.sourceStartMs + Math.max(0, startMs - segment.startMs) * segment.playbackRate;
        audioClips.push({
          asset: {
            type: "audio",
            src: clip.src,
            trim: sourceAtStart / 1000,
            volume: state.gain,
            ...(Math.abs(segment.playbackRate - 1) > 0.001 ? { speed: segment.playbackRate } : {}),
          },
          start: startMs / 1000,
          length: (endMs - startMs) / 1000,
        });
      }
      // Keep each logical audio clip on its own Shotstack track so music,
      // voiceover and SFX can overlap without violating track overlap rules.
      if (audioClips.length) tracks.push({ clips: audioClips });
    }
  }

  const bgClips: unknown[] = [];
  if (opts.backgroundVideoUrl) {
    bgClips.push({ asset: { type: "video", src: opts.backgroundVideoUrl, volume: 0 }, start: 0, length: totalSec, fit: "crop", position: "center" });
  } else {
    for (const range of ranges) {
      const bg = range.scene.background ?? "#0A0A0A";
      bgClips.push({
        asset: { type: "html", html: `<div style="width:${dims.w}px;height:${dims.h}px;background:${bg};"></div>`, width: dims.w, height: dims.h },
        start: range.startMs / 1000,
        length: range.durationMs / 1000,
        fit: "none",
        scale,
        position: "center",
      });
    }
  }
  tracks.push({ clips: bgClips });

  return {
    timeline: {
      background: "#000000",
      ...(opts.audioUrl && !(doc.version === 2 && doc.audioClips.length)
        ? { soundtrack: { src: opts.audioUrl, effect: "fadeOut", volume: opts.audioVolume ?? doc.audio?.volume ?? 0.7 } }
        : {}),
      tracks,
    },
    output: { format: "mp4", fps: opts.fps ?? 25, size: { width: outW, height: outH } },
    ...(opts.callbackUrl ? { callback: opts.callbackUrl } : {}),
  };
}

export async function submitShotstackRender(edit: unknown, cred?: RenderCredentials | null): Promise<string> {
  const c = creds(cred);
  const res = await fetch(`${apiBase(c.env)}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": c.key },
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

export async function getShotstackRender(id: string, cred?: RenderCredentials | null): Promise<ShotstackStatus> {
  const c = creds(cred);
  const res = await fetch(`${apiBase(c.env)}/render/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": c.key },
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