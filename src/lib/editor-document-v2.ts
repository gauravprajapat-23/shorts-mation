import { effectiveSceneDurationMs } from "@/lib/timeline-duration";
import type {
  EditorDocument,
  EditorDocumentV2,
  EditorElement,
  EditorTrack,
  EditorTrackKind,
  EditorAudioClip,
} from "@/lib/types";

const TRACK_ORDER: Array<{ kind: EditorTrackKind; name: string }> = [
  { kind: "video", name: "Video" },
  { kind: "image", name: "Images" },
  { kind: "text", name: "Text" },
  { kind: "graphics", name: "Graphics" },
  { kind: "captions", name: "Captions" },
  { kind: "audio", name: "Audio" },
  { kind: "effects", name: "Effects" },
];

export function elementTrackKind(el: EditorElement): EditorTrackKind {
  if (el.type === "shape") return "graphics";
  return el.type;
}

/**
 * Rebuild timeline metadata from scenes/elements. Element timing is the source
 * of truth, which keeps legacy renderers and editor operations compatible.
 */
export function syncV2Timeline(doc: EditorDocumentV2): EditorDocumentV2 {
  const tracks = new Map<EditorTrackKind, EditorTrack>(
    TRACK_ORDER.map(({ kind, name }) => [kind, { id: `track_${kind}`, kind, name, clips: [] }]),
  );

  let sceneStartMs = 0;
  for (const scene of doc.scenes) {
    const sceneDuration = Math.max(250, effectiveSceneDurationMs(scene));
    for (const el of scene.elements) {
      const kind = elementTrackKind(el);
      const localStart = Math.max(0, Math.min(el.startMs ?? 0, sceneDuration));
      const maxDuration = Math.max(100, sceneDuration - localStart);
      const duration = Math.max(100, Math.min(el.durationMs ?? maxDuration, maxDuration));
      tracks.get(kind)?.clips.push({
        id: `clip_${el.id}`,
        sceneId: scene.id,
        elementId: el.id,
        kind,
        name: el.type === "text" ? el.text.slice(0, 32) || "Text" : el.type === "shape" ? el.shape : el.type,
        startMs: sceneStartMs + localStart,
        durationMs: duration,
      });
    }
    sceneStartMs += sceneDuration;
  }

  const captionTrack = tracks.get("captions")!;
  const normalizedCaptions = (doc.captionClips ?? []).map((clip) => {
    const startMs = Math.max(0, Math.min(clip.startMs, Math.max(0, sceneStartMs - 100)));
    const durationMs = Math.max(100, Math.min(clip.durationMs, Math.max(100, sceneStartMs - startMs)));
    return { ...clip, startMs, durationMs };
  });
  for (const clip of normalizedCaptions) captionTrack.clips.push({
    id: `caption_${clip.id}`, sceneId: "__project_captions__", elementId: clip.id, kind: "captions",
    name: clip.name || clip.words.map((word) => word.text).join(" ").slice(0, 32) || "Caption", startMs: clip.startMs, durationMs: clip.durationMs,
  });

  const audioTrack = tracks.get("audio")!;
  const normalizedAudio = (doc.audioClips ?? []).map((clip) => {
    const startMs = Math.max(0, Math.min(clip.startMs, Math.max(0, sceneStartMs - 100)));
    const durationMs = Math.max(100, Math.min(clip.durationMs, Math.max(100, sceneStartMs - startMs)));
    return { ...clip, startMs, durationMs };
  });
  for (const clip of normalizedAudio) {
    audioTrack.clips.push({
      id: `audio_${clip.id}`,
      sceneId: "__project_audio__",
      elementId: clip.id,
      kind: "audio",
      name: clip.name || clip.role,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
    });
  }

  return {
    ...doc,
    durationMs: Math.max(250, sceneStartMs),
    audioClips: normalizedAudio,
    captionClips: normalizedCaptions,
    audioMix: doc.audioMix ?? { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 },
    tracks: TRACK_ORDER.map(({ kind }) => tracks.get(kind)!).filter((track) => track.clips.length > 0 || track.kind === "video" || track.kind === "text"),
  };
}

export function migrateDocumentV1ToV2(input: EditorDocument): EditorDocumentV2 {
  if (input.version === 2) return syncV2Timeline(input);
  const dims = input.aspect === "16:9" ? { w: 1920, h: 1080 } : input.aspect === "1:1" ? { w: 1080, h: 1080 } : { w: 1080, h: 1920 };
  const scenes = input.scenes.map((scene) => ({
    ...scene,
    elements: scene.elements.map((el) => {
      const durationMs = el.durationMs ?? Math.max(100, scene.durationMs);
      if (el.type === "video") {
        const playbackRate = Math.max(0.1, el.playbackRate ?? 1);
        const sourceStartMs = Math.max(0, el.sourceStartMs ?? 0);
        return {
          ...el,
          startMs: el.startMs ?? 0,
          durationMs,
          sourceStartMs,
          sourceEndMs: el.sourceEndMs ?? (sourceStartMs + durationMs * playbackRate),
          playbackRate,
          volume: el.volume ?? 1,
        };
      }
      return {
        ...el,
        startMs: el.startMs ?? 0,
        durationMs,
      };
    }),
  }));

  return syncV2Timeline({
    version: 2,
    aspect: input.aspect,
    width: dims.w,
    height: dims.h,
    fps: 30,
    durationMs: scenes.reduce((sum, scene) => sum + Math.max(250, effectiveSceneDurationMs(scene)), 0),
    scenes,
    tracks: [],
    captionClips: [],
    audioClips: input.audio?.src ? [{
      id: "legacy_music",
      name: "Legacy music",
      src: input.audio.src,
      role: "music",
      startMs: 0,
      durationMs: scenes.reduce((sum, scene) => sum + Math.max(250, effectiveSceneDurationMs(scene)), 0),
      sourceStartMs: 0,
      volume: input.audio.volume ?? 0.7,
      muted: input.audio.mute ?? false,
      fadeInMs: input.audio.fadeIn ?? 0,
      fadeOutMs: input.audio.fadeOut ?? 0,
      loop: true,
      ducking: true,
    } satisfies EditorAudioClip] : [],
    audioMix: { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 },
    audio: input.audio,
    variables: input.variables ?? [],
  });
}

export function sceneStartMs(doc: EditorDocumentV2, sceneIndex: number): number {
  return doc.scenes.slice(0, Math.max(0, sceneIndex)).reduce((sum, scene) => sum + Math.max(250, effectiveSceneDurationMs(scene)), 0);
}

export function sceneIndexAtTime(doc: EditorDocumentV2, timeMs: number): number {
  let cursor = 0;
  for (let i = 0; i < doc.scenes.length; i++) {
    cursor += Math.max(250, effectiveSceneDurationMs(doc.scenes[i]!));
    if (timeMs < cursor) return i;
  }
  return Math.max(0, doc.scenes.length - 1);
}
