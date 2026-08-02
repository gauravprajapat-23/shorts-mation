// Client-side MP4 renderer using ffmpeg.wasm. Composes a background video with
// an SVG overlay burned in as a PNG. Falls back cleanly when ffmpeg fails to load.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import { resolveDocVars, totalDocDurationMs } from "@/lib/animate";
import type { EditorDocument } from "@/lib/types";

// The @ffmpeg/ffmpeg wrapper runs inside a module worker in Vite. Loading the
// UMD core blob from that module worker fails because it has no default export,
// so use the ESM core build instead.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (!loadPromise) {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
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
  const ff = await getFfmpeg(opts.onLog);

  const args: string[] = ["-y"];
  const fps = Math.max(12, Math.min(30, opts.fps ?? 20));
  const maxDurationMs = opts.maxDurationMs ?? 30000;

  // Animated path — rasterize every frame from `doc` at the current time.
  if (opts.doc) {
    const vars0 = opts.vars ?? {};
    // Resolve variables before measuring so scenes are long enough for the
    // fully-substituted text reveal.
    const resolvedDoc = resolveDocVars(opts.doc, vars0);
    const totalMs = Math.min(maxDurationMs, totalDocDurationMs(resolvedDoc.scenes));
    const totalFrames = Math.max(1, Math.round((totalMs / 1000) * fps));
    const vars = opts.vars ?? {};

    // Rasterize each frame → f00001.png
    for (let i = 0; i < totalFrames; i++) {
      const tMs = (i / fps) * 1000;
      const svg = buildSceneSvgAtTime({
        doc: resolvedDoc,
        tMs,
        vars,
        includeBackground: !opts.backgroundVideoUrl,
      });
      const png = await svgToPngBlob(svg, w, h);
      const name = `f${String(i + 1).padStart(5, "0")}.png`;
      await ff.writeFile(name, new Uint8Array(await png.arrayBuffer()));
      // 0..60% for rasterization
      opts.onProgress?.(Math.floor((i / totalFrames) * 60));
      // yield to the UI every 8 frames so the tab stays responsive
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    // 60..99% for ffmpeg encode
    ff.on("progress", ({ progress }) => {
      const pct = 60 + Math.round(progress * 39);
      opts.onProgress?.(Math.max(60, Math.min(99, pct)));
    });

    const durationSec = totalFrames / fps;
    if (opts.backgroundVideoUrl) {
      const bgBytes = await fetchFile(opts.backgroundVideoUrl);
      await ff.writeFile("bg.mp4", bgBytes);
      if (opts.loop) args.push("-stream_loop", "-1");
      args.push("-i", "bg.mp4");
      args.push("-framerate", String(fps), "-i", "f%05d.png");
      args.push("-filter_complex",
        `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[bg];[bg][1:v]overlay=0:0:format=auto[v]`,
      );
      args.push("-map", "[v]");
      if (opts.muted) args.push("-an"); else args.push("-map", "0:a?");
    } else {
      args.push("-framerate", String(fps), "-i", "f%05d.png");
      args.push("-vf", `scale=${w}:${h}`);
      args.push("-an");
    }
    args.push("-t", String(durationSec));
  } else {
    // Legacy path — single overlay PNG burned over background/black canvas.
    if (!opts.overlaySvg || !opts.durationSeconds) throw new Error("renderMp4: provide doc or overlaySvg+durationSeconds");
    const overlayPng = await svgToPngBlob(opts.overlaySvg, w, h);
    await ff.writeFile("overlay.png", new Uint8Array(await overlayPng.arrayBuffer()));
    ff.on("progress", ({ progress }) => opts.onProgress?.(Math.round(progress * 99)));
    if (opts.backgroundVideoUrl) {
      const bgBytes = await fetchFile(opts.backgroundVideoUrl);
      await ff.writeFile("bg.mp4", bgBytes);
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

  await ff.exec(args);
  const data = await ff.readFile("out.mp4");
  opts.onProgress?.(100);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
}
