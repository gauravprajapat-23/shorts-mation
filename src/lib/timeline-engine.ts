import {
  computeCamera,
  computeElementFrame,
  resolveDocVars,
  sceneTransitionOverlayOpacity,
} from "@/lib/animate";
import { effectiveSceneDurationMs } from "@/lib/timeline-duration";
import type {
  EditorDocument,
  EditorElement,
  EditorScene,
  VideoElement,
  EditorCaptionClip,
  CaptionWord,
} from "@/lib/types";
import type { ElementFrame } from "@/lib/animate";
import { evaluateEffectClips, evaluateTransition } from "@/lib/effects";
import type { EffectState, TransitionFrame } from "@/lib/effects";

export type TimelineVideoState = {
  sourceTimeMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  loop: boolean;
};

export type TimelineElementState = {
  element: EditorElement;
  frame: ElementFrame;
  visible: boolean;
  clipStartMs: number;
  clipDurationMs: number;
  clipLocalMs: number;
  projectStartMs: number;
  projectEndMs: number;
  video?: TimelineVideoState;
};


export type TimelineCaptionWordState = CaptionWord & {
  active: boolean;
  spoken: boolean;
  progress: number;
};

export type TimelineCaptionState = {
  clip: EditorCaptionClip;
  visible: boolean;
  localMs: number;
  activeWordIndex: number;
  words: TimelineCaptionWordState[];
};

export type TimelineFrameState = {
  tMs: number;
  durationMs: number;
  sceneIndex: number;
  scene: EditorScene | null;
  sceneStartMs: number;
  sceneDurationMs: number;
  localMs: number;
  camera: { scale: number; tx: number; ty: number };
  transitionOverlayOpacity: number;
  transition: TransitionFrame;
  effects: EffectState[];
  visibleEffects: EffectState[];
  elements: TimelineElementState[];
  visibleElements: TimelineElementState[];
  captions: TimelineCaptionState[];
  visibleCaptions: TimelineCaptionState[];
};

export type TimelineSceneRange = {
  index: number;
  scene: EditorScene;
  startMs: number;
  durationMs: number;
  endMs: number;
};

/** Canonical scene ranges used by editor, preview and all renderers. */
export function getTimelineSceneRanges(doc: EditorDocument): TimelineSceneRange[] {
  let cursor = 0;
  return doc.scenes.map((scene, index) => {
    const durationMs = Math.max(250, effectiveSceneDurationMs(scene));
    const range = { index, scene, startMs: cursor, durationMs, endMs: cursor + durationMs };
    cursor += durationMs;
    return range;
  });
}

export function timelineDurationMs(doc: EditorDocument): number {
  const ranges = getTimelineSceneRanges(doc);
  return Math.max(250, ranges[ranges.length - 1]?.endMs ?? 250);
}

export function timelineSceneIndexAtTime(doc: EditorDocument, tMs: number): number {
  const ranges = getTimelineSceneRanges(doc);
  if (!ranges.length) return 0;
  const safe = Math.max(0, tMs);
  const found = ranges.find((range) => safe < range.endMs);
  return found?.index ?? ranges[ranges.length - 1]!.index;
}

export function timelineSceneStartMs(doc: EditorDocument, sceneIndex: number): number {
  return getTimelineSceneRanges(doc)[Math.max(0, sceneIndex)]?.startMs ?? 0;
}

function videoState(el: VideoElement, clipLocalMs: number, clipDurationMs: number): TimelineVideoState {
  const playbackRate = Math.max(0.1, el.playbackRate ?? 1);
  const sourceStartMs = Math.max(0, el.sourceStartMs ?? 0);
  const fallbackEnd = sourceStartMs + clipDurationMs * playbackRate;
  const mediaEnd = el.mediaDurationMs && el.mediaDurationMs > 0 ? el.mediaDurationMs : Number.POSITIVE_INFINITY;
  const sourceEndMs = Math.max(sourceStartMs + 1, Math.min(el.sourceEndMs ?? fallbackEnd, mediaEnd));
  const sourceSpanMs = Math.max(1, sourceEndMs - sourceStartMs);
  const rawSourceMs = sourceStartMs + Math.max(0, clipLocalMs) * playbackRate;
  const sourceTimeMs = el.loop && rawSourceMs >= sourceEndMs
    ? sourceStartMs + ((rawSourceMs - sourceStartMs) % sourceSpanMs)
    : Math.min(sourceEndMs, rawSourceMs);

  const fadeIn = Math.max(0, el.fadeInMs ?? 0);
  const fadeOut = Math.max(0, el.fadeOutMs ?? 0);
  const fadeInGain = fadeIn > 0 ? Math.min(1, Math.max(0, clipLocalMs) / fadeIn) : 1;
  const fadeOutGain = fadeOut > 0 ? Math.min(1, Math.max(0, clipDurationMs - clipLocalMs) / fadeOut) : 1;
  const volume = Math.max(0, Math.min(1, (el.volume ?? 1) * Math.min(fadeInGain, fadeOutGain)));

  return {
    sourceTimeMs,
    sourceStartMs,
    sourceEndMs,
    playbackRate,
    volume,
    muted: el.muted ?? true,
    loop: el.loop ?? false,
  };
}

export function evaluateTimelineCaptions(inputDoc: EditorDocument, tMs: number): TimelineCaptionState[] {
  if (inputDoc.version !== 2) return [];
  return (inputDoc.captionClips ?? []).map((clip) => {
    const localMs = tMs - clip.startMs;
    const visible = !clip.hidden && localMs >= 0 && localMs <= clip.durationMs;
    let activeWordIndex = -1;
    const words = clip.words.map((word, index) => {
      const span = Math.max(1, word.endMs - word.startMs);
      const progress = Math.max(0, Math.min(1, (localMs - word.startMs) / span));
      const active = visible && localMs >= word.startMs && localMs < word.endMs;
      if (active) activeWordIndex = index;
      return { ...word, active, spoken: visible && localMs >= word.endMs, progress };
    });
    return { clip, visible, localMs, activeWordIndex, words };
  });
}

/**
 * Evaluate one project frame. This is the single timing source for the live
 * editor, SVG preview, browser FFmpeg exporter and Shotstack timeline builder.
 */
export function evaluateTimelineFrame(
  inputDoc: EditorDocument,
  tMs: number,
  vars: Record<string, string> = {},
): TimelineFrameState {
  const doc = resolveDocVars(inputDoc, vars);
  const ranges = getTimelineSceneRanges(doc);
  const durationMs = Math.max(250, ranges[ranges.length - 1]?.endMs ?? 250);
  const safeTime = Math.max(0, Math.min(tMs, Math.max(0, durationMs - 0.001)));
  const range = ranges.find((item) => safeTime < item.endMs) ?? ranges[ranges.length - 1];

  if (!range) {
    return {
      tMs: safeTime,
      durationMs,
      sceneIndex: 0,
      scene: null,
      sceneStartMs: 0,
      sceneDurationMs: durationMs,
      localMs: 0,
      camera: { scale: 1, tx: 0, ty: 0 },
      transitionOverlayOpacity: 0,
      transition: evaluateTransition("cut", 0),
      effects: [],
      visibleEffects: [],
      elements: [],
      visibleElements: [],
      captions: [],
      visibleCaptions: [],
    };
  }

  const localMs = safeTime - range.startMs;
  const elements = range.scene.elements.map((element): TimelineElementState => {
    const clipStartMs = Math.max(0, Math.min(element.startMs ?? 0, range.durationMs));
    const clipDurationMs = Math.max(1, Math.min(element.durationMs ?? (range.durationMs - clipStartMs), Math.max(1, range.durationMs - clipStartMs)));
    const clipLocalMs = localMs - clipStartMs;
    const inClip = clipLocalMs >= 0 && clipLocalMs <= clipDurationMs;
    const frame = computeElementFrame(element, Math.max(0, clipLocalMs), clipDurationMs);
    const visible = inClip && frame.visible && frame.opacity > 0.001;
    return {
      element,
      frame,
      visible,
      clipStartMs,
      clipDurationMs,
      clipLocalMs,
      projectStartMs: range.startMs + clipStartMs,
      projectEndMs: range.startMs + clipStartMs + clipDurationMs,
      ...(element.type === "video" ? { video: videoState(element, clipLocalMs, clipDurationMs) } : {}),
    };
  });

  const captions = evaluateTimelineCaptions(doc, safeTime);
  const effects = doc.version === 2 ? evaluateEffectClips(doc.effectClips ?? [], safeTime) : [];
  const transition = evaluateTransition(range.scene.transitionIn ?? "cut", localMs);

  return {
    tMs: safeTime,
    durationMs,
    sceneIndex: range.index,
    scene: range.scene,
    sceneStartMs: range.startMs,
    sceneDurationMs: range.durationMs,
    localMs,
    camera: computeCamera(range.scene, localMs),
    transitionOverlayOpacity: sceneTransitionOverlayOpacity(range.scene, localMs),
    transition,
    effects,
    visibleEffects: effects.filter((item) => item.visible),
    elements,
    visibleElements: elements.filter((item) => item.visible),
    captions,
    visibleCaptions: captions.filter((item) => item.visible),
  };
}

export type TimelineVideoSegment = {
  element: VideoElement;
  sceneIndex: number;
  startMs: number;
  durationMs: number;
  endMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  frame: ElementFrame;
};

/** Static clip descriptors consumed by non-interactive render backends. */
export function collectTimelineVideoSegments(
  inputDoc: EditorDocument,
  vars: Record<string, string> = {},
): TimelineVideoSegment[] {
  const doc = resolveDocVars(inputDoc, vars);
  const ranges = getTimelineSceneRanges(doc);
  const out: TimelineVideoSegment[] = [];
  for (const range of ranges) {
    for (const element of range.scene.elements) {
      if (element.type !== "video" || !element.src || element.src.startsWith("{{")) continue;
      const localStart = Math.max(0, Math.min(element.startMs ?? 0, range.durationMs));
      const durationMs = Math.max(1, Math.min(element.durationMs ?? (range.durationMs - localStart), Math.max(1, range.durationMs - localStart)));
      const baseStartMs = range.startMs + localStart;
      // Keyframed video clips are sampled into short render descriptors. This
      // lets FFmpeg and Shotstack follow the same x/y/scale/rotation/opacity/
      // blur/crop curve even though their native animation APIs differ.
      const hasKeyframes = Boolean(element.keyframes?.length);
      const stepMs = hasKeyframes ? Math.max(50, Math.min(125, durationMs / 60)) : durationMs;
      for (let offset = 0; offset < durationMs - 0.5; offset += stepMs) {
        const chunkDuration = Math.min(stepMs, durationMs - offset);
        const projectStart = baseStartMs + offset;
        const frameState = evaluateTimelineFrame(doc, projectStart + Math.min(1, chunkDuration / 2), {});
        const item = frameState.elements.find((candidate) => candidate.element.id === element.id);
        const video = item?.video ?? videoState(element, offset, durationMs);
        const sourceAtStart = videoState(element, offset, durationMs).sourceTimeMs;
        const sourceAtEnd = videoState(element, offset + chunkDuration, durationMs).sourceTimeMs;
        out.push({
          element, sceneIndex: range.index, startMs: projectStart, durationMs: chunkDuration, endMs: projectStart + chunkDuration,
          sourceStartMs: sourceAtStart,
          sourceEndMs: Math.max(sourceAtStart + 1, sourceAtEnd),
          playbackRate: video.playbackRate, volume: video.volume, muted: video.muted, loop: video.loop,
          frame: item?.frame ?? computeElementFrame(element, offset, durationMs),
        });
        if (!hasKeyframes) break;
      }
    }
  }
  return out;
}

export type TimelineAudioSegment = {
  clip: import("@/lib/types").EditorAudioClip;
  startMs: number;
  durationMs: number;
  endMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  playbackRate: number;
};

export function collectTimelineAudioSegments(inputDoc: EditorDocument): TimelineAudioSegment[] {
  if (inputDoc.version !== 2) return [];
  return (inputDoc.audioClips ?? []).filter((clip) => clip.src && clip.durationMs > 0).map((clip) => {
    const playbackRate = Math.max(0.1, clip.playbackRate ?? 1);
    const sourceStartMs = Math.max(0, clip.sourceStartMs ?? 0);
    const fallbackEnd = sourceStartMs + clip.durationMs * playbackRate;
    const sourceEndMs = Math.max(sourceStartMs + 1, Math.min(clip.sourceEndMs ?? fallbackEnd, clip.mediaDurationMs ?? Number.POSITIVE_INFINITY));
    return {
      clip,
      startMs: Math.max(0, clip.startMs),
      durationMs: Math.max(1, clip.durationMs),
      endMs: Math.max(0, clip.startMs) + Math.max(1, clip.durationMs),
      sourceStartMs,
      sourceEndMs,
      playbackRate,
    };
  });
}

function envelopeGain(localMs: number, durationMs: number, fadeInMs = 0, fadeOutMs = 0): number {
  const inGain = fadeInMs > 0 ? Math.min(1, Math.max(0, localMs) / fadeInMs) : 1;
  const outGain = fadeOutMs > 0 ? Math.min(1, Math.max(0, durationMs - localMs) / fadeOutMs) : 1;
  return Math.max(0, Math.min(1, Math.min(inGain, outGain)));
}

function duckGainAtTime(doc: import("@/lib/types").EditorDocumentV2, tMs: number, musicClipId: string): number {
  const mix = doc.audioMix;
  if (!mix?.duckingEnabled) return 1;
  const music = doc.audioClips.find((clip) => clip.id === musicClipId);
  if (!music || music.role !== "music" || music.ducking === false) return 1;
  const voices = doc.audioClips.filter((clip) => clip.role === "voiceover" && !clip.muted);
  if (!voices.length) return 1;
  let gain = 1;
  for (const voice of voices) {
    const start = voice.startMs;
    const end = voice.startMs + voice.durationMs;
    const attackStart = start - Math.max(0, mix.attackMs ?? 0);
    const releaseEnd = end + Math.max(0, mix.releaseMs ?? 0);
    if (tMs < attackStart || tMs > releaseEnd) continue;
    let localGain = mix.duckLevel;
    if (tMs < start && start > attackStart) {
      const p = (tMs - attackStart) / (start - attackStart);
      localGain = 1 + (mix.duckLevel - 1) * p;
    } else if (tMs > end && releaseEnd > end) {
      const p = (tMs - end) / (releaseEnd - end);
      localGain = mix.duckLevel + (1 - mix.duckLevel) * p;
    }
    gain = Math.min(gain, localGain);
  }
  return Math.max(0, Math.min(1, gain));
}

export type TimelineAudioState = {
  clip: import("@/lib/types").EditorAudioClip;
  visible: boolean;
  localMs: number;
  sourceTimeMs: number;
  gain: number;
  muted: boolean;
};

export function evaluateTimelineAudio(inputDoc: EditorDocument, tMs: number): TimelineAudioState[] {
  if (inputDoc.version !== 2) return [];
  const hasSolo = inputDoc.audioClips.some((clip) => clip.solo && !clip.muted);
  return collectTimelineAudioSegments(inputDoc).map((segment) => {
    const localMs = tMs - segment.startMs;
    const visible = localMs >= 0 && localMs <= segment.durationMs;
    const clip = segment.clip;
    const sourceSpan = Math.max(1, segment.sourceEndMs - segment.sourceStartMs);
    let sourceTimeMs = segment.sourceStartMs + Math.max(0, localMs) * segment.playbackRate;
    if (clip.loop && sourceTimeMs >= segment.sourceEndMs) sourceTimeMs = segment.sourceStartMs + ((sourceTimeMs - segment.sourceStartMs) % sourceSpan);
    else sourceTimeMs = Math.min(segment.sourceEndMs, sourceTimeMs);
    const muted = Boolean(clip.muted || (hasSolo && !clip.solo));
    const fade = envelopeGain(localMs, segment.durationMs, clip.fadeInMs, clip.fadeOutMs);
    const duck = clip.role === "music" ? duckGainAtTime(inputDoc, tMs, clip.id) : 1;
    return {
      clip,
      visible,
      localMs,
      sourceTimeMs,
      gain: muted || !visible ? 0 : Math.max(0, Math.min(1, clip.volume * fade * duck)),
      muted,
    };
  });
}
