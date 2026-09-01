import { describe, expect, it } from "vitest";
import { buildShotstackEdit } from "@/lib/shotstack.server";
import type { EditorDocumentV2 } from "@/lib/types";

const doc: EditorDocumentV2 = {
  version: 2,
  aspect: "9:16",
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: 5000,
  variables: [],
  tracks: [],
  audioClips: [],
  captionClips: [],
  effectClips: [],
  audioMix: { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 },
  scenes: [{
    id: "scene",
    name: "Scene",
    durationMs: 5000,
    background: "#121212",
    elements: [{
      id: "video",
      type: "video",
      src: "https://example.com/clip.mp4",
      fit: "cover",
      x: 108,
      y: 192,
      w: 540,
      h: 960,
      rotation: 0,
      opacity: 0.75,
      startMs: 1000,
      durationMs: 2000,
      sourceStartMs: 3000,
      sourceEndMs: 7000,
      playbackRate: 2,
      volume: 0.5,
      muted: false,
    }],
  }],
};

describe("Shotstack V2 timeline", () => {
  it("emits scene video elements as real video clips instead of skipping them", () => {
    const edit = buildShotstackEdit({ doc, vars: {}, resolution: "1080p" }) as any;
    const allClips = edit.timeline.tracks.flatMap((track: any) => track.clips ?? []);
    const clip = allClips.find((candidate: any) => candidate.asset?.type === "video" && candidate.asset?.src === "https://example.com/clip.mp4");
    expect(clip).toBeTruthy();
    expect(clip.start).toBe(1);
    expect(clip.length).toBe(2);
    expect(clip.asset.trim).toBe(3);
    expect(clip.asset.speed).toBe(2);
    expect(clip.asset.volume).toBe(0.5);
    expect(clip.opacity).toBe(0.75);
  });
  it("emits professional captions as timed HTML segments", () => {
    const captionDoc: EditorDocumentV2 = { ...doc, captionClips: [{
      id: "cap", name: "Caption", startMs: 500, durationMs: 1600, x: 80, y: 1300, w: 920, h: 260,
      words: [
        { id: "w1", text: "Hello", startMs: 0, endMs: 800 },
        { id: "w2", text: "world", startMs: 800, endMs: 1600 },
      ],
      style: { preset: "bold-pop", animation: "pop", fontFamily: "Plus Jakarta Sans", fontSize: 72, fontWeight: 900, color: "#FFFFFF", activeColor: "#FFE600", background: "rgba(0,0,0,0.4)" },
    }] };
    const edit = buildShotstackEdit({ doc: captionDoc, vars: {} }) as any;
    const captionSegments = edit.timeline.tracks.flatMap((track: any) => track.clips ?? []).filter((clip: any) => clip.asset?.type === "html" && String(clip.asset?.html ?? "").includes("Hello"));
    expect(captionSegments.length).toBeGreaterThanOrEqual(2);
    expect(captionSegments.some((clip: any) => clip.start === 0.5)).toBe(true);
  });

});
