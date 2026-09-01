import { describe, expect, it } from "vitest";
import { buildRenderGoldenManifest, estimateBrowserRenderBudget } from "@/lib/render-certification";
import { buildShotstackEdit } from "@/lib/shotstack.server";
import type { EditorDocumentV2 } from "@/lib/types";

function fixture(): EditorDocumentV2 {
  return {
    version: 2, aspect: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 4000,
    variables: [], tracks: [], effectClips: [{ id: "fx", name: "flash", kind: "flash", startMs: 1900, durationMs: 300, intensity: 0.7, opacity: 1 }],
    captionClips: [{ id: "cap", name: "Caption", startMs: 500, durationMs: 1000, x: 80, y: 1400, w: 920, h: 220,
      words: [{ id: "cw", text: "Golden", startMs: 0, endMs: 1000 }],
      style: { preset: "bold-pop", animation: "pop", fontFamily: "Inter", fontSize: 64, fontWeight: 800, color: "#fff", activeColor: "#ff0", background: "rgba(0,0,0,.4)" } }],
    audioClips: [{ id: "aud", name: "Music", src: "https://example.com/a.mp3", role: "music", startMs: 0, durationMs: 4000, sourceStartMs: 1000, sourceEndMs: 5000, playbackRate: 1, volume: 0.5, muted: false, solo: false, loop: false, ducking: true }],
    audioMix: { duckingEnabled: true, duckLevel: 0.2, attackMs: 100, releaseMs: 200 },
    scenes: [
      { id: "s1", name: "Hook", durationMs: 2000, background: "#101010", elements: [
        { id: "txt", type: "text", text: "Hello", x: 100, y: 100, w: 880, h: 250, rotation: 0, opacity: 1, fontFamily: "Inter", fontSize: 72, fontWeight: 800, color: "#fff", align: "center", startMs: 0, durationMs: 2000 },
      ] },
      { id: "s2", name: "Video", durationMs: 2000, background: "#202020", elements: [
        { id: "vid", type: "video", src: "https://example.com/v.mp4", fit: "cover", x: 0, y: 0, w: 1080, h: 1920, rotation: 0, opacity: 1, startMs: 0, durationMs: 2000, sourceStartMs: 3000, sourceEndMs: 5000, playbackRate: 1, volume: 0, muted: true },
      ] },
    ],
  };
}

describe("V2.14 renderer golden parity", () => {
  it("freezes the canonical frame/segment manifest", () => {
    expect(buildRenderGoldenManifest(fixture(), [0, 500, 1999, 2000, 2500, 3999])).toEqual({
      durationMs: 4000,
      scenes: [{ id: "s1", startMs: 0, durationMs: 2000 }, { id: "s2", startMs: 2000, durationMs: 2000 }],
      frames: [
        { tMs: 0, sceneId: "s1", visibleElementIds: ["txt"], visibleCaptionIds: [], visibleEffectIds: [], camera: { scale: 1, tx: 0, ty: 0 } },
        { tMs: 500, sceneId: "s1", visibleElementIds: ["txt"], visibleCaptionIds: ["cap"], visibleEffectIds: [], camera: { scale: 1, tx: 0, ty: 0 } },
        { tMs: 1999, sceneId: "s1", visibleElementIds: ["txt"], visibleCaptionIds: [], visibleEffectIds: ["fx"], camera: { scale: 1, tx: 0, ty: 0 } },
        { tMs: 2000, sceneId: "s2", visibleElementIds: ["vid"], visibleCaptionIds: [], visibleEffectIds: ["fx"], camera: { scale: 1, tx: 0, ty: 0 } },
        { tMs: 2500, sceneId: "s2", visibleElementIds: ["vid"], visibleCaptionIds: [], visibleEffectIds: [], camera: { scale: 1, tx: 0, ty: 0 } },
        { tMs: 3999, sceneId: "s2", visibleElementIds: ["vid"], visibleCaptionIds: [], visibleEffectIds: [], camera: { scale: 1, tx: 0, ty: 0 } },
      ],
      videoSegments: [{ elementId: "vid", startMs: 2000, durationMs: 2000, sourceStartMs: 3000, sourceEndMs: 5000 }],
      audioSegments: [{ clipId: "aud", startMs: 0, durationMs: 4000, sourceStartMs: 1000, sourceEndMs: 5000 }],
    });
  });

  it("keeps Shotstack real-media timing aligned with the canonical manifest", () => {
    const doc = fixture();
    const edit = buildShotstackEdit({ doc, vars: {}, resolution: "1080p" }) as any;
    const clips = edit.timeline.tracks.flatMap((track: any) => track.clips ?? []);
    const video = clips.find((clip: any) => clip.asset?.type === "video" && clip.asset?.src === "https://example.com/v.mp4");
    const audio = clips.find((clip: any) => clip.asset?.type === "audio" && clip.asset?.src === "https://example.com/a.mp3");
    expect({ start: video.start, length: video.length, trim: video.asset.trim }).toEqual({ start: 2, length: 2, trim: 3 });
    expect({ start: audio.start, length: audio.length, trim: audio.asset.trim }).toEqual({ start: 0, length: 4, trim: 1 });
  });

  it("rejects an excessive browser render budget", () => {
    const budget = estimateBrowserRenderBudget({ doc: fixture(), fps: 30, outputWidth: 2160, outputHeight: 3840, maxFrames: 100, maxPixels: 2_000_000 });
    expect(budget.safe).toBe(false);
    expect(budget.reasons.length).toBeGreaterThanOrEqual(1);
  });
});
