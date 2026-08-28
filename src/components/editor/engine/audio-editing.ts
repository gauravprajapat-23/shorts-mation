import type { EditorAudioClip } from "@/lib/types";

export function applyAudioTimelineEdit(
  clip: EditorAudioClip,
  nextStartMs: number,
  nextDurationMs: number,
  mode: "move" | "trim-left" | "trim-right",
): EditorAudioClip {
  const rate = Math.max(0.1, clip.playbackRate ?? 1);
  const oldStart = Math.max(0, clip.startMs);
  const oldSourceStart = Math.max(0, clip.sourceStartMs ?? 0);
  let sourceStartMs = oldSourceStart;
  if (mode === "trim-left") sourceStartMs = Math.max(0, oldSourceStart + (nextStartMs - oldStart) * rate);
  let sourceEndMs = sourceStartMs + Math.max(100, nextDurationMs) * rate;
  if (mode === "move") sourceEndMs = clip.sourceEndMs ?? sourceEndMs;
  if (mode === "trim-right") sourceEndMs = Math.max(sourceStartMs + 1, sourceEndMs);
  if (clip.mediaDurationMs) sourceEndMs = Math.min(clip.mediaDurationMs, sourceEndMs);
  return {
    ...clip,
    startMs: Math.max(0, Math.round(nextStartMs)),
    durationMs: Math.max(100, Math.round(nextDurationMs)),
    sourceStartMs: Math.round(sourceStartMs),
    sourceEndMs: Math.round(sourceEndMs),
  };
}

export function splitAudioClip(clip: EditorAudioClip, playheadMs: number): [EditorAudioClip, EditorAudioClip] | null {
  const splitLocal = playheadMs - clip.startMs;
  if (splitLocal <= 100 || splitLocal >= clip.durationMs - 100) return null;
  const rate = Math.max(0.1, clip.playbackRate ?? 1);
  const sourceStart = Math.max(0, clip.sourceStartMs ?? 0);
  const splitSource = sourceStart + splitLocal * rate;
  const left: EditorAudioClip = { ...clip, durationMs: Math.round(splitLocal), sourceEndMs: Math.round(splitSource) };
  const right: EditorAudioClip = {
    ...clip,
    id: `${clip.id}_split_${Date.now().toString(36)}`,
    name: `${clip.name} (split)`,
    startMs: Math.round(playheadMs),
    durationMs: Math.round(clip.durationMs - splitLocal),
    sourceStartMs: Math.round(splitSource),
  };
  return [left, right];
}

export async function decodeWaveform(fileOrUrl: Blob | string, peaks = 120): Promise<{ durationMs: number; waveform: number[] } | null> {
  if (typeof window === "undefined") return null;
  try {
    const arrayBuffer = typeof fileOrUrl === "string" ? await (await fetch(fileOrUrl)).arrayBuffer() : await fileOrUrl.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / peaks));
    const waveform = Array.from({ length: peaks }, (_, i) => {
      let max = 0;
      const start = i * block;
      const end = Math.min(channel.length, start + block);
      for (let j = start; j < end; j++) max = Math.max(max, Math.abs(channel[j] ?? 0));
      return Number(max.toFixed(4));
    });
    await ctx.close();
    return { durationMs: Math.round(buffer.duration * 1000), waveform };
  } catch {
    return null;
  }
}
