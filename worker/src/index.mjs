import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verify } from "./security.mjs";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.FFMPEG_WORKER_SECRET || "";
const MAX = Math.max(1, Number(process.env.MAX_CONCURRENCY || 2));
const RETRIES = Math.max(0, Number(process.env.MAX_RETRIES || 2));
const PUBLIC = (process.env.PUBLIC_WORKER_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
if (SECRET.length < 24) throw new Error("FFMPEG_WORKER_SECRET must be at least 24 characters");

const jobs = new Map();
const queue = [];
let active = 0;
let draining = false;
const ffmpegOk = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const rasterizerOk = spawnSync("rsvg-convert", ["--version"], { stdio: "ignore" }).status === 0;

const json = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};
const cleanup = (job) => job?.dir ? rm(job.dir, { recursive: true, force: true }).catch(() => {}) : Promise.resolve();
async function body(req) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 1_000_000) throw new Error("body too large");
  }
  return value;
}
function auth(req, raw) {
  return verify(SECRET, String(req.headers["x-worker-timestamp"] || ""), raw, String(req.headers["x-worker-signature"] || ""));
}
async function callback(job, status, extra = {}) {
  job.status = status;
  Object.assign(job, extra);
  const outputUrl = status === "completed" ? `${PUBLIC}/outputs/${job.id}?token=${encodeURIComponent(job.outputToken)}` : null;
  try {
    await fetch(job.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: job.id, status, progress: job.progress, error: job.error ?? null, url: outputUrl }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {}
}
async function fetchTo(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`asset fetch ${response.status}`);
  const max = Math.max(1024 * 1024, Number(process.env.MAX_ASSET_BYTES || 512 * 1024 * 1024));
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > max) throw new Error("asset exceeds worker limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("asset has no body");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error("asset exceeds worker limit"); }
    chunks.push(Buffer.from(value));
  }
  await writeFile(path, Buffer.concat(chunks, total));
}
function flattenClips(manifest) {
  const tracks = Array.isArray(manifest.timeline?.tracks) ? manifest.timeline.tracks : [];
  return tracks.flatMap((track) => Array.isArray(track.clips) ? track.clips : []);
}
function frameSvg(clips, time, width, height) {
  const candidates = clips
    .filter((clip) => clip?.asset?.type === "svg" && time >= Number(clip.start || 0) && time < Number(clip.start || 0) + Number(clip.length || 0))
    .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  const svg = candidates.at(-1)?.asset?.svg;
  if (typeof svg === "string" && svg.includes("<svg")) return svg;
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/></svg>`;
}
function runProcess(command, args, job) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    job.process = child;
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-700)}`)));
  });
}
async function render(job) {
  const dir = join(tmpdir(), `shortsforge-${job.id}`);
  job.dir = dir;
  await mkdir(dir, { recursive: true });
  await callback(job, "rendering", { progress: 1 });
  const manifestResponse = await fetch(job.manifestUrl, { signal: AbortSignal.timeout(30_000) });
  if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  const width = Math.max(16, Number(manifest.output?.size?.width || 1080));
  const height = Math.max(16, Number(manifest.output?.size?.height || 1920));
  const fps = Math.max(1, Math.min(60, Number(manifest.output?.fps || 25)));
  const clips = flattenClips(manifest);
  const media = clips.filter((clip) => clip?.asset?.type === "video" && clip?.asset?.src);
  if (media.length > 1) throw new Error("Native worker supports one background video per job");
  const total = Math.max(0.2, ...clips.map((clip) => Number(clip.start || 0) + Number(clip.length || 0)));
  const totalFrames = Math.max(1, Math.ceil(total * fps));
  const frameDir = join(dir, "frames");
  await mkdir(frameDir);
  for (let index = 0; index < totalFrames; index++) {
    if (job.cancelled) throw new Error("cancelled");
    const svgPath = join(dir, "frame.svg");
    const pngPath = join(frameDir, `${String(index + 1).padStart(6, "0")}.png`);
    await writeFile(svgPath, frameSvg(clips, index / fps, width, height));
    await runProcess("rsvg-convert", ["-w", String(width), "-h", String(height), "-o", pngPath, svgPath], job);
    if (index % Math.max(1, Math.floor(totalFrames / 20)) === 0) {
      await callback(job, "rendering", { progress: Math.min(70, Math.round(index / totalFrames * 70)) });
    }
  }
  const outputPath = join(dir, "out.mp4");
  const args = ["-y", "-framerate", String(fps), "-i", join(frameDir, "%06d.png")];
  if (media[0]) {
    const backgroundPath = join(dir, "background.mp4");
    await fetchTo(media[0].asset.src, backgroundPath);
    args.push("-stream_loop", "-1", "-i", backgroundPath, "-filter_complex", `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[bg];[bg][0:v]overlay=0:0[v]`, "-map", "[v]");
  } else args.push("-map", "0:v");
  if (manifest.timeline?.soundtrack?.src) {
    const audioPath = join(dir, "soundtrack.bin");
    await fetchTo(manifest.timeline.soundtrack.src, audioPath);
    args.push("-stream_loop", "-1", "-i", audioPath, "-map", `${media[0] ? 2 : 1}:a?`, "-c:a", "aac", "-shortest");
  }
  args.push("-t", String(total), "-c:v", "libx264", "-preset", process.env.FFMPEG_PRESET || "medium", "-crf", process.env.FFMPEG_CRF || "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath);
  await runProcess("ffmpeg", args, job);
  job.process = null;
  job.outputPath = outputPath;
  await callback(job, "completed", { progress: 100 });
  setTimeout(() => { void cleanup(job); jobs.delete(job.id); }, Math.max(300, Number(process.env.JOB_TTL_SECONDS || 21600)) * 1000).unref();
}
async function execute(job) {
  try {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try { await render(job); return; }
      catch (error) {
        if (job.cancelled) { await callback(job, "cancelled", { error: "cancelled" }); await cleanup(job); return; }
        job.error = error instanceof Error ? error.message : String(error);
        if (attempt === RETRIES) { await callback(job, "failed", { error: job.error }); await cleanup(job); return; }
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1000 * 2 ** attempt)));
      }
    }
  } finally {
    job.process = null;
    active = Math.max(0, active - 1);
    pump();
  }
}
function pump() {
  while (!draining && active < MAX && queue.length) {
    const job = queue.shift();
    if (!job || job.cancelled) continue;
    active++;
    void execute(job);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://worker");
    if (req.method === "GET" && url.pathname.startsWith("/outputs/")) {
      const id = url.pathname.split("/").pop();
      const job = jobs.get(id);
      if (!job?.outputPath || url.searchParams.get("token") !== job.outputToken) return json(res, 404, { error: "not found" });
      const file = await stat(job.outputPath);
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(file.size), "cache-control": "private, no-store" });
      return createReadStream(job.outputPath).pipe(res);
    }
    const raw = await body(req);
    if (!auth(req, raw)) return json(res, 401, { error: "invalid signature" });
    if (req.method === "GET" && url.pathname === "/health") return json(res, ffmpegOk && rasterizerOk ? 200 : 503, { ok: !draining, ffmpeg: ffmpegOk, rasterizer: rasterizerOk, active, queued: queue.length, maxConcurrency: MAX });
    if (req.method === "POST" && url.pathname === "/jobs") {
      if (draining) return json(res, 503, { error: "draining" });
      const data = JSON.parse(raw);
      if (![data.idempotencyKey, data.attemptId, data.manifestUrl, data.callbackUrl].every((value) => typeof value === "string" && value.length > 0)) return json(res, 400, { error: "invalid job" });
      const existing = [...jobs.values()].find((job) => job.idempotencyKey === data.idempotencyKey);
      if (existing) return json(res, 200, { id: existing.id, status: existing.status });
      const job = { id: randomUUID(), idempotencyKey: data.idempotencyKey, attemptId: data.attemptId, manifestUrl: data.manifestUrl, callbackUrl: data.callbackUrl, status: "queued", progress: 0, outputToken: randomUUID() };
      jobs.set(job.id, job);
      queue.push(job);
      await callback(job, "queued", { progress: 0 });
      pump();
      return json(res, 202, { id: job.id, status: job.status });
    }
    const match = url.pathname.match(/^\/jobs\/([^/]+)$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return json(res, 404, { error: "not found" });
      if (req.method === "GET") return json(res, 200, { id: job.id, status: job.status, progress: job.progress, error: job.error ?? null, outputUrl: job.outputPath ? `${PUBLIC}/outputs/${job.id}?token=${encodeURIComponent(job.outputToken)}` : null });
      if (req.method === "DELETE") {
        job.cancelled = true;
        const queuedIndex = queue.indexOf(job);
        if (queuedIndex >= 0) { queue.splice(queuedIndex, 1); await callback(job, "cancelled", { error: "cancelled" }); await cleanup(job); jobs.delete(job.id); }
        else job.process?.kill("SIGTERM");
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: "not found" });
  } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : "worker error" }); }
});

server.listen(PORT, () => console.log(`FFmpeg worker listening on ${PORT}`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  draining = true;
  server.close();
  const timer = setTimeout(() => process.exit(1), 30_000);
  const wait = setInterval(() => { if (active === 0) { clearInterval(wait); clearTimeout(timer); process.exit(0); } }, 250);
});