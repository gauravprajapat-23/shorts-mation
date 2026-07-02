// Client-side MP4 renderer using ffmpeg.wasm. Composes a background video with
// an SVG overlay burned in as a PNG. Falls back cleanly when ffmpeg fails to load.
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

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
  overlaySvg: string; // full SVG string for the frame
  durationSeconds: number;
  resolution: RenderResolution;
  quality: RenderQuality;
  muted: boolean;
  loop: boolean;
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

  ff.on("progress", ({ progress }) => opts.onProgress?.(Math.min(99, Math.round(progress * 100))));

  const overlayPng = await svgToPngBlob(opts.overlaySvg, w, h);
  await ff.writeFile("overlay.png", new Uint8Array(await overlayPng.arrayBuffer()));

  const args: string[] = ["-y"];

  if (opts.backgroundVideoUrl) {
    const bgBytes = await fetchFile(opts.backgroundVideoUrl);
    await ff.writeFile("bg.mp4", bgBytes);
    if (opts.loop) args.push("-stream_loop", "-1");
    args.push("-i", "bg.mp4");
    args.push("-i", "overlay.png");
    args.push("-filter_complex",
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg];[bg][1:v]overlay=0:0:format=auto[v]`,
    );
    args.push("-map", "[v]");
    if (opts.muted) args.push("-an");
    else args.push("-map", "0:a?");
  } else {
    // No background video: create a solid black canvas
    args.push("-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:d=${opts.durationSeconds}`);
    args.push("-i", "overlay.png");
    args.push("-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[v]");
    args.push("-map", "[v]");
    args.push("-an");
  }

  args.push("-t", String(opts.durationSeconds));
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
