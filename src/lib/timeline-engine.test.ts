import { describe, expect, it } from "vitest";
import { collectTimelineVideoSegments, evaluateTimelineFrame, getTimelineSceneRanges, timelineDurationMs } from "@/lib/timeline-engine";
import type { EditorDocumentV2, VideoElement } from "@/lib/types";

const video: VideoElement = {
  id: "video-1",
  type: "video",
  src: "https://example.com/source.mp4",
  fit: "cover",
  x: 100,
  y: 200,
  w: 800,
  h: 900,
  rotation: 0,
  opacity: 1,
  startMs: 1000,
  durationMs: 3000,
  sourceStartMs: 5000,
  sourceEndMs: 11000,
  playbackRate: 2,
  volume: 0.8,
  muted: false,
};

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
  audioMix: { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 },
  scenes: [{
    id: "s1",
    name: "Scene",
    durationMs: 5000,
    background: "#000000",
    elements: [video],
  }],
};

describe("timeline engine", () => {
  it("uses the same effective scene boundaries for duration and scene ranges", () => {
    const ranges = getTimelineSceneRanges(doc);
    expect(ranges).toHaveLength(1);
    expect(timelineDurationMs(doc)).toBe(ranges[0].durationMs);
  });

  it("hides clips before their start and maps playhead time to source time", () => {
    expect(evaluateTimelineFrame(doc, 999).visibleElements).toHaveLength(0);
    const state = evaluateTimelineFrame(doc, 2000).visibleElements[0];
    expect(state.element.id).toBe("video-1");
    expect(state.video?.sourceTimeMs).toBe(7000);
    expect(state.projectStartMs).toBe(1000);
    expect(state.projectEndMs).toBe(4000);
  });

  it("exports the same trim window and project timing for render backends", () => {
    const segment = collectTimelineVideoSegments(doc)[0];
    expect(segment.startMs).toBe(1000);
    expect(segment.durationMs).toBe(3000);
    expect(segment.sourceStartMs).toBe(5000);
    expect(segment.sourceEndMs).toBe(11000);
    expect(segment.playbackRate).toBe(2);
    expect(segment.muted).toBe(false);
  });
});
