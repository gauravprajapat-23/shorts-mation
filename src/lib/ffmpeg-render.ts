// Client-side MP4 renderer using ffmpeg.wasm. Composes a background video with
// an SVG overlay burned in as a PNG. Falls back cleanly when ffmpeg fails to load.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { buildSceneBackgroundSvgAtTime, buildSceneSvgAtTime } from "@/lib/scene-svg";
import { resolveDocVars } from "@/lib/animate";
import { collectTimelineAudioSegments, collectTimelineVideoSegments, timelineDurationMs } from "@/lib/timeline-engine";
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument } from "@/lib/types";
import { resolveMediaLook } from "@/lib/effects";

// The @ffmpeg/ffmpeg wrapper runs inside a module worker in Vite. Loading the
// UMD core blob from that module worker fails because it has no default export,
// so use the ESM core build instead.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let renderInProgress = false;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (!loadPromise) {
    const ff = new FFmpeg();
    loadPromise = ff
      .load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      })
      .then(() => {
        ffmpegSingleton = ff;
        return ff;
      });
  }
  return loadPromise;
}

export type RenderResolution = "720p" | "1080p" | "4k";
export type RenderQuality = "draft" | "standard" | "high";

export type ClientRenderOptions = {
  backgroundVideoUrl: string | null;
  audioUrl?: string | null;
  audioVolume?: number;
  resolution: RenderResolution;
  quality: RenderQuality;
  muted: boolean;
  loop: boolean;
  // Animated pipeline
  doc?: EditorDocument;
  vars?: Record<string, string>;
  fps?: number;
  maxDurationMs?: number;
  // Legacy single-frame overlay (used when doc is not provided)
  overlaySvg?: string;
  durationSeconds?: number;
  onProgress?: (pct: number) => void;
  onLog?: (msg: string) => void;
};

const RES_MAP: Record<RenderResolution, { w: number; h: number }> = {
  "720p": { w: 720, h: 1280 },
  "1080p": { w: 1080, h: 1920 },
  "4k": { w: 2160, h: 3840 },
};

const CRF_MAP: Record<RenderQuality, string> = {
  draft: "30",
  standard: "23",
  high: "18",
};

function svgToPngBlob(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("2D context unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Overlay SVG failed to load")); };
    img.src = url;
  });
}

export async function renderMp4(opts: ClientRenderOptions): Promise<Blob> {
  const { w, h } = RES_MAP[opts.resolution];
  const crf = CRF_MAP[opts.quality];
  const ff = await getFfmpeg();
  if (renderInProgress) throw new Error("An export is already in progress. Finish or cancel it before starting another export.");
  renderInProgress = true;
  const writtenFiles = new Set<string>();
  const writeFile = async (name: string, data: Parameters<FFmpeg["writeFile"]>[1]) => {
    writtenFiles.add(name);
    await ff.writeFile(name, data);
  };
  const logHandler = opts.onLog ? ({ message }: { message: string }) => opts.onLog?.(message) : null;
  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = opts.doc ? 55 + Math.round(progress * 44) : Math.round(progress * 99);
    opts.onProgress?.(Math.max(0, Math.min(99, pct)));
  };
  if (logHandler) ff.on("log", logHandler);
  ff.on("progress", progressHandler);

  try {
  const args: string[] = ["-y"];
  const fps = Math.max(12, Math.min(30, opts.fps ?? 20));
  const maxDurationMs = opts.maxDurationMs ?? 30000;

  // Animated path — all timing comes from the shared timeline evaluator.
  if (opts.doc) {
    const vars0 = opts.vars ?? {};
    const resolvedDoc = resolveDocVars(opts.doc, vars0);
    const totalMs = Math.min(maxDurationMs, timelineDurationMs(resolvedDoc));
    const totalFrames = Math.max(1, Math.round((totalMs / 1000) * fps));
    const videoSegments = collectTimelineVideoSegments(resolvedDoc);
    const audioSegments = collectTimelineAudioSegments(resolvedDoc);
    const design = CANVAS_DIMS[resolvedDoc.aspect];

    // Rasterize transparent graphics/text overlays and, when there is no
    // external background video, a background-only frame sequence. Videos are
    // composited between those two layers by FFmpeg.
    for (let i = 0; i < totalFrames; i++) {
      const tMs = (i / fps) * 1000;
      const overlaySvg = buildSceneSvgAtTime({
        doc: resolvedDoc,
        tMs,
        vars: {},
        includeBackground: false,
        includeVideo: false,
      });
      const overlayPng = await svgToPngBlob(overlaySvg, w, h);
      await writeFile(`ov${String(i + 1).padStart(5, "0")}.png`, new Uint8Array(await overlayPng.arrayBuffer()));

      if (!opts.backgroundVideoUrl) {
        const backgroundSvg = buildSceneBackgroundSvgAtTime({ doc: resolvedDoc, tMs });
        const backgroundPng = await svgToPngBlob(backgroundSvg, w, h);
        await writeFile(`bg${String(i + 1).padStart(5, "0")}.png`, new Uint8Array(await backgroundPng.arrayBuffer()));
      }

      opts.onProgress?.(Math.floor((i / totalFrames) * 55));
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }


    // Input 0: background. Input 1: transparent overlay frames. Inputs 2+:
    // timeline video elements. Optional music is appended last.
    if (opts.backgroundVideoUrl) {
      const bgBytes = await fetchFile(opts.backgroundVideoUrl);
      await writeFile("project-bg.mp4", bgBytes);
      if (opts.loop) args.push("-stream_loop", "-1");
      args.push("-i", "project-bg.mp4");
    } else {
      args.push("-framerate", String(fps), "-i", "bg%05d.png");
    }
    args.push("-framerate", String(fps), "-i", "ov%05d.png");

    // Deduplicate physical FFmpeg inputs. Keyframed clips are intentionally
    // sampled into many timeline segments, but they should not download/write
    // the same media asset once per segment. Reusing one input dramatically
    // reduces WASM memory pressure on long/animated projects.
    const videoSources = [...new Set(videoSegments.map((segment) => segment.element.src))];
    const videoInputIndex = new Map<string, number>();
    for (let i = 0; i < videoSources.length; i++) {
      const src = videoSources[i]!;
      const bytes = await fetchFile(src);
      const name = `video-source-${i}.bin`;
      await writeFile(name, bytes);
      if (videoSegments.some((segment) => segment.element.src === src && segment.loop)) args.push("-stream_loop", "-1");
      args.push("-i", name);
      videoInputIndex.set(src, i + 2);
    }

    const audioInputStart = 2 + videoSources.length;
    const audioSources = [...new Set(audioSegments.map((segment) => segment.clip.src))];
    const audioInputIndex = new Map<string, number>();
    for (let i = 0; i < audioSources.length; i++) {
      const src = audioSources[i]!;
      const bytes = await fetchFile(src);
      const name = `audio-source-${i}.bin`;
      await writeFile(name, bytes);
      if (audioSegments.some((segment) => segment.clip.src === src && segment.clip.loop)) args.push("-stream_loop", "-1");
      args.push("-i", name);
      audioInputIndex.set(src, audioInputStart + i);
    }
    let legacyMusicInputIndex: number | null = null;
    if (!audioSegments.length && opts.audioUrl) {
      const musicBytes = await fetchFile(opts.audioUrl);
      await writeFile("music.m4a", musicBytes);
      legacyMusicInputIndex = audioInputStart;
      args.push("-stream_loop", "-1", "-i", "music.m4a");
    }

    const filters: string[] = [];
    if (opts.backgroundVideoUrl) {
      filters.push(`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[base0]`);
    } else {
      filters.push(`[0:v]scale=${w}:${h},setsar=1[base0]`);
    }

    let current = "base0";
    for (let i = 0; i < videoSegments.length; i++) {
      const segment = videoSegments[i]!;
      const inputIndex = videoInputIndex.get(segment.element.src);
      if (inputIndex == null) throw new Error(`Missing FFmpeg video input for ${segment.element.src}`);
      const baseW = Math.max(2, Math.round((segment.element.w / design.w) * w));
      const baseH = Math.max(2, Math.round((segment.element.h / design.h) * h));
      const targetW = Math.max(2, Math.round(baseW * segment.frame.scale));
      const targetH = Math.max(2, Math.round(baseH * segment.frame.scale));
      const x = Math.round((segment.frame.x / design.w) * w - (targetW - baseW) / 2);
      const y = Math.round((segment.frame.y / design.h) * h - (targetH - baseH) / 2);
      const sourceStart = Math.max(0, segment.sourceStartMs / 1000);
      const sourceEnd = Math.max(sourceStart + 0.001, segment.sourceEndMs / 1000);
      const startSec = segment.startMs / 1000;
      const endSec = segment.endMs / 1000;
      const fit = segment.element.fit === "contain"
        ? `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black@0`
        : `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
      const alpha = Math.max(0, Math.min(1, segment.frame.opacity));
      const cropScale = Math.max(1, segment.frame.cropScale);
      const cropFilter = cropScale > 1.001
        ? `,scale=${Math.round(targetW * cropScale)}:${Math.round(targetH * cropScale)},crop=${targetW}:${targetH}:(iw-ow)/2-${(segment.frame.cropX / 100 * targetW).toFixed(3)}:(ih-oh)/2-${(segment.frame.cropY / 100 * targetH).toFixed(3)}`
        : "";
      const look = resolveMediaLook(segment.element.filterPreset, segment.element.colorAdjustments);
      const eqBrightness = Math.max(-1, Math.min(1, (look.brightness * Math.pow(2, look.exposure)) - 1));
      const mediaLookFilter = `,eq=brightness=${eqBrightness.toFixed(4)}:contrast=${Math.max(0.1,look.contrast).toFixed(4)}:saturation=${Math.max(0,look.saturation).toFixed(4)}` + (look.blur > 0.1 ? `,gblur=sigma=${Math.min(50,look.blur).toFixed(3)}` : "") + (look.vignette > 0.03 ? `,vignette=PI/${Math.max(3, 10-look.vignette*6).toFixed(2)}` : "") + (look.grain > 0.03 ? `,noise=alls=${Math.round(look.grain*28)}:allf=t` : "");
      const blurFilter = segment.frame.blurPx > 0.1 ? `,gblur=sigma=${Math.min(50, segment.frame.blurPx).toFixed(3)}` : "";
      const rotateFilter = Math.abs(segment.frame.rotation) > 0.01 ? `,rotate=${(segment.frame.rotation * Math.PI / 180).toFixed(8)}:ow=iw:oh=ih:c=none` : "";
      filters.push(`[${inputIndex}:v]trim=start=${sourceStart.toFixed(6)}:end=${sourceEnd.toFixed(6)},setpts=(PTS-STARTPTS)/${segment.playbackRate.toFixed(6)}+${startSec.toFixed(6)}/TB,${fit}${cropFilter}${mediaLookFilter}${blurFilter}${rotateFilter},format=rgba,colorchannelmixer=aa=${alpha.toFixed(4)}[clip${i}]`);
      filters.push(`[${current}][clip${i}]overlay=${x}:${y}:enable='between(t,${startSec.toFixed(6)},${endSec.toFixed(6)})'[comp${i}]`);
      current = `comp${i}`;
    }
    filters.push(`[${current}][1:v]overlay=0:0:format=auto[v]`);

    const audioLabels: string[] = [];
    const hasSolo = resolvedDoc.version === 2 && resolvedDoc.audioClips.some((clip) => clip.solo && !clip.muted);
    const mixSettings = resolvedDoc.version === 2 ? resolvedDoc.audioMix : undefined;
    const duckExpr = (clipId: string) => {
      if (resolvedDoc.version !== 2 || !mixSettings?.duckingEnabled) return "1";
      const music = resolvedDoc.audioClips.find((clip) => clip.id === clipId);
      if (!music || music.role !== "music" || music.ducking === false) return "1";
      const voices = resolvedDoc.audioClips.filter((clip) => clip.role === "voiceover" && !clip.muted);
      if (!voices.length) return "1";
      const level = Math.max(0, Math.min(1, mixSettings.duckLevel));
      const clauses = voices.map((voice) => {
        const a0 = Math.max(0, voice.startMs - mixSettings.attackMs) / 1000;
        const a1 = voice.startMs / 1000;
        const r0 = (voice.startMs + voice.durationMs) / 1000;
        const r1 = (voice.startMs + voice.durationMs + mixSettings.releaseMs) / 1000;
        const attack = mixSettings.attackMs > 0 ? `if(between(t,${a0.toFixed(4)},${a1.toFixed(4)}),1-(1-${level.toFixed(4)})*(t-${a0.toFixed(4)})/${Math.max(0.001,(a1-a0)).toFixed(4)},` : "";
        const body = `if(between(t,${a1.toFixed(4)},${r0.toFixed(4)}),${level.toFixed(4)},`;
        const release = mixSettings.releaseMs > 0 ? `if(between(t,${r0.toFixed(4)},${r1.toFixed(4)}),${level.toFixed(4)}+(1-${level.toFixed(4)})*(t-${r0.toFixed(4)})/${Math.max(0.001,(r1-r0)).toFixed(4)},1)` : "1";
        return `${attack}${body}${release})${mixSettings.attackMs > 0 ? ")" : ""}`;
      });
      return clauses.reduce((acc, expr) => `min(${acc},${expr})`, "1");
    };
    const atempo = (rate: number) => {
      const parts: number[] = []; let r = Math.max(0.25, Math.min(4, rate));
      while (r > 2) { parts.push(2); r /= 2; }
      while (r < 0.5) { parts.push(0.5); r /= 0.5; }
      parts.push(r);
      return parts.map((v) => `atempo=${v.toFixed(6)}`).join(",");
    };
    for (let i = 0; i < audioSegments.length; i++) {
      const segment = audioSegments[i]!;
      const clip = segment.clip;
      const inputIndex = audioInputIndex.get(segment.clip.src);
      if (inputIndex == null) throw new Error(`Missing FFmpeg audio input for ${segment.clip.src}`);
      const sourceStart = segment.sourceStartMs / 1000;
      const sourceEnd = segment.sourceEndMs / 1000;
      const delay = Math.max(0, Math.round(segment.startMs));
      const muted = clip.muted || (hasSolo && !clip.solo);
      const baseVolume = muted ? 0 : Math.max(0, Math.min(1, clip.volume));
      const chain = [
        `atrim=start=${sourceStart.toFixed(6)}:end=${sourceEnd.toFixed(6)}`,
        "asetpts=PTS-STARTPTS",
        atempo(segment.playbackRate),
        ...(clip.fadeInMs && clip.fadeInMs > 0 ? [`afade=t=in:st=0:d=${(clip.fadeInMs/1000).toFixed(4)}`] : []),
        ...(clip.fadeOutMs && clip.fadeOutMs > 0 ? [`afade=t=out:st=${Math.max(0,(segment.durationMs-clip.fadeOutMs)/1000).toFixed(4)}:d=${(clip.fadeOutMs/1000).toFixed(4)}`] : []),
        `adelay=${delay}|${delay}`,
        `volume='${baseVolume.toFixed(4)}*${duckExpr(clip.id)}':eval=frame`,
      ].join(",");
      filters.push(`[${inputIndex}:a]${chain}[aud${i}]`);
      audioLabels.push(`[aud${i}]`);
    }
    if (audioLabels.length) filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0[aout]`);
    if (legacyMusicInputIndex != null) filters.push(`[${legacyMusicInputIndex}:a]volume=${(opts.audioVolume ?? 0.7).toFixed(2)}[aout]`);

    args.push("-filter_complex", filters.join(";"));
    args.push("-map", "[v]");

    if (audioLabels.length || legacyMusicInputIndex != null) {
      args.push("-map", "[aout]", "-c:a", "aac", "-shortest");
    } else if (opts.backgroundVideoUrl && !opts.muted) {
      args.push("-map", "0:a?");
    } else {
      args.push("-an");
    }

    args.push("-t", String(totalFrames / fps));
  } else {
    // Legacy path — single overlay PNG burned over background/black canvas.
    if (!opts.overlaySvg || !opts.durationSeconds) throw new Error("renderMp4: provide doc or overlaySvg+durationSeconds");
    const overlayPng = await svgToPngBlob(opts.overlaySvg, w, h);
    await writeFile("overlay.png", new Uint8Array(await overlayPng.arrayBuffer()));
    if (opts.backgroundVideoUrl) {
      const bgBytes = await fetchFile(opts.backgroundVideoUrl);
      await writeFile("bg.mp4", bgBytes);
      if (opts.loop) args.push("-stream_loop", "-1");
      args.push("-i", "bg.mp4", "-i", "overlay.png");
      args.push("-filter_complex",
        `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg];[bg][1:v]overlay=0:0:format=auto[v]`);
      args.push("-map", "[v]");
      if (opts.muted) args.push("-an"); else args.push("-map", "0:a?");
    } else {
      args.push("-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:d=${opts.durationSeconds}`);
      args.push("-i", "overlay.png");
      args.push("-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[v]");
      args.push("-map", "[v]", "-an");
    }
    args.push("-t", String(opts.durationSeconds));
  }

  args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", crf, "-pix_fmt", "yuv420p");
  args.push("out.mp4");
  writtenFiles.add("out.mp4");

  await ff.exec(args);
  const data = await ff.readFile("out.mp4");
  opts.onProgress?.(100);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
  } finally {
    renderInProgress = false;
    ff.off("progress", progressHandler);
    if (logHandler) ff.off("log", logHandler);
    for (const name of [...writtenFiles].reverse()) {
      try { await ff.deleteFile(name); } catch { /* best-effort WASM FS cleanup */ }
    }
  }
}
