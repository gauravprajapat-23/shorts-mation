// Server-side manifest builder for the native FFmpeg worker.
// The edge runtime never executes FFmpeg. It builds a serializable timeline
// manifest which the separately deployed native worker consumes.
import { computeRevealDurationMs, resolveDocVars } from "@/lib/animate";
import { collectTimelineAudioSegments, collectTimelineVideoSegments, evaluateTimelineAudio, evaluateTimelineFrame, getTimelineSceneRanges, timelineDurationMs } from "@/lib/timeline-engine";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, EditorScene, TextElement } from "@/lib/types";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";

const MAX_REVEAL_STEPS = 14;

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

function publicAssetUrl(src: string): string {
  if (!src.startsWith("/")) return src;
  const base = (process.env["PUBLIC_APP_URL"] || "").replace(/\/$/, "");
  return base ? `${base}${src}` : src;
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

function workerFilterForPreset(preset?: import("@/lib/types").MediaFilterPreset): string | undefined {
  switch (preset) {
    case "mono": return "greyscale"; case "high-contrast": return "contrast"; case "gaming": case "cinematic": return "boost";
    case "vintage": case "podcast": case "documentary": return "muted"; default: return undefined;
  }
}

export type WorkerManifestOptions = {
  doc: EditorDocument;
  vars: Record<string, string>;
  backgroundVideoUrl?: string | null;
  audioUrl?: string | null;
  audioVolume?: number;
  resolution?: "720p" | "1080p";
  fps?: number;
  callbackUrl?: string | null;
};

/** Turns the editor document into a native FFmpeg worker edit payload. Scene text reveals
 *  become a series of short HTML clips so the word-by-word pacing survives. */
export function buildFfmpegWorkerManifest(opts: WorkerManifestOptions) {
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
        asset: {
          type: "svg",
          svg: buildSceneSvgAtTime({
            doc,
            tMs: startMs + Math.min(1, lengthMs / 2),
            vars: opts.vars,
            includeBackground: !opts.backgroundVideoUrl,
            includeVideo: false,
          }),
          width: dims.w,
          height: dims.h,
        },
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

  // Timeline video elements are real native FFmpeg worker video assets now (previously
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
      ...(workerFilterForPreset(el.filterPreset) ? { filter: workerFilterForPreset(el.filterPreset) } : {}),
    }] });
  }

  // V2.5 project audio clips. We split clips at fade/ducking boundaries so
  // native FFmpeg worker receives the same time-varying gain envelope as editor preview.
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
            src: publicAssetUrl(clip.src),
            trim: sourceAtStart / 1000,
            volume: state.gain,
            ...(Math.abs(segment.playbackRate - 1) > 0.001 ? { speed: segment.playbackRate } : {}),
          },
          start: startMs / 1000,
          length: (endMs - startMs) / 1000,
        });
      }
      // Keep each logical audio clip on its own native FFmpeg worker track so music,
      // voiceover and SFX can overlap without violating track overlap rules.
      if (audioClips.length) tracks.push({ clips: audioClips });
    }
  }

  const bgClips: unknown[] = [];
  if (opts.backgroundVideoUrl) {
    bgClips.push({ asset: { type: "video", src: opts.backgroundVideoUrl, volume: 0 }, start: 0, length: totalSec, fit: "crop", position: "center" });
  }
  if (bgClips.length) tracks.push({ clips: bgClips });

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

