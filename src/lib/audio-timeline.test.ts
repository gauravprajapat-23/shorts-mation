import { describe, expect, it } from "vitest";
import { evaluateTimelineAudio } from "@/lib/timeline-engine";
import type { EditorDocumentV2 } from "@/lib/types";

const doc: EditorDocumentV2 = {
  version: 2, aspect: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 6000,
  variables: [], tracks: [], scenes: [{ id: "s", name: "Scene", durationMs: 6000, background: "#000", elements: [] }],
  captionClips: [],
  effectClips: [],
  audioMix: { duckingEnabled: true, duckLevel: 0.2, attackMs: 200, releaseMs: 300 },
  audioClips: [
    { id: "music", name: "Music", src: "music.mp3", role: "music", startMs: 0, durationMs: 6000, volume: 1, ducking: true },
    { id: "voice", name: "Voice", src: "voice.mp3", role: "voiceover", startMs: 2000, durationMs: 1000, volume: 1 },
  ],
};

describe("audio timeline", () => {
  it("ducks music while voiceover is active", () => {
    const before = evaluateTimelineAudio(doc, 1000).find((s) => s.clip.id === "music")!;
    const during = evaluateTimelineAudio(doc, 2500).find((s) => s.clip.id === "music")!;
    expect(before.gain).toBeCloseTo(1);
    expect(during.gain).toBeCloseTo(0.2);
  });

  it("applies fade envelopes", () => {
    const faded: EditorDocumentV2 = { ...doc, audioClips: [{ ...doc.audioClips[0]!, fadeInMs: 1000 }] };
    const state = evaluateTimelineAudio(faded, 500)[0]!;
    expect(state.gain).toBeCloseTo(0.5);
  });
});
