import type { VideoElement } from "@/lib/types";

export type VideoTimelineEditMode = "move" | "trim-left" | "trim-right";

export function videoSourceWindow(element: VideoElement, fallbackDurationMs: number) {
  const playbackRate = Math.max(0.1, element.playbackRate ?? 1);
  const sourceStartMs = Math.max(0, element.sourceStartMs ?? 0);
  const timelineDurationMs = Math.max(100, element.durationMs ?? fallbackDurationMs);
  const unclampedEnd = element.sourceEndMs ?? (sourceStartMs + timelineDurationMs * playbackRate);
  const sourceEndMs = element.mediaDurationMs ? Math.min(unclampedEnd, element.mediaDurationMs) : unclampedEnd;
  return { playbackRate, sourceStartMs, sourceEndMs: Math.max(sourceStartMs + 1, sourceEndMs) };
}

export function applyVideoTimelineEdit(
  element: VideoElement,
  fallbackDurationMs: number,
  nextStartMs: number,
  nextDurationMs: number,
  mode: VideoTimelineEditMode,
): VideoElement {
  if (mode === "move") {
    return { ...element, startMs: Math.round(nextStartMs), durationMs: Math.round(nextDurationMs) };
  }

  const oldStartMs = element.startMs ?? 0;
  const oldDurationMs = element.durationMs ?? fallbackDurationMs;
  const { playbackRate, sourceStartMs, sourceEndMs } = videoSourceWindow(element, fallbackDurationMs);
  let nextSourceStart = sourceStartMs;
  let nextSourceEnd = sourceEndMs;
  let effectiveDurationMs = nextDurationMs;

  if (mode === "trim-left") {
    const shiftMs = nextStartMs - oldStartMs;
    nextSourceStart = Math.max(0, sourceStartMs + shiftMs * playbackRate);
    nextSourceStart = Math.min(nextSourceStart, nextSourceEnd - 1);
  } else {
    nextSourceEnd = nextSourceStart + nextDurationMs * playbackRate;
    if (element.mediaDurationMs) {
      nextSourceEnd = Math.min(nextSourceEnd, element.mediaDurationMs);
      effectiveDurationMs = Math.max(100, (nextSourceEnd - nextSourceStart) / playbackRate);
    }
  }

  // Preserve the original source out-point when trimming only the left edge.
  if (mode === "trim-left" && element.sourceEndMs == null) {
    nextSourceEnd = sourceStartMs + oldDurationMs * playbackRate;
  }

  return {
    ...element,
    startMs: Math.round(nextStartMs),
    durationMs: Math.round(effectiveDurationMs),
    sourceStartMs: Math.round(nextSourceStart),
    sourceEndMs: Math.round(Math.max(nextSourceStart + 1, nextSourceEnd)),
  };
}

export function splitVideoElement(
  element: VideoElement,
  localSplitMs: number,
  rightId: string,
  fallbackDurationMs: number,
): [VideoElement, VideoElement] | null {
  const clipStartMs = element.startMs ?? 0;
  const clipDurationMs = element.durationMs ?? fallbackDurationMs;
  const offsetMs = localSplitMs - clipStartMs;
  if (offsetMs < 100 || offsetMs > clipDurationMs - 100) return null;

  const { playbackRate, sourceStartMs, sourceEndMs } = videoSourceWindow(element, fallbackDurationMs);
  const splitSourceMs = Math.min(sourceEndMs, sourceStartMs + offsetMs * playbackRate);

  return [
    { ...element, durationMs: Math.round(offsetMs), sourceStartMs: Math.round(sourceStartMs), sourceEndMs: Math.round(splitSourceMs) },
    {
      ...element,
      id: rightId,
      startMs: Math.round(localSplitMs),
      durationMs: Math.round(clipDurationMs - offsetMs),
      sourceStartMs: Math.round(splitSourceMs),
      sourceEndMs: Math.round(sourceEndMs),
    },
  ];
}
