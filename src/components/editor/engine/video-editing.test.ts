import { describe, expect, it } from "vitest";
import { applyVideoTimelineEdit, splitVideoElement } from "@/components/editor/engine/video-editing";
import type { VideoElement } from "@/lib/types";

const video: VideoElement = {
  id: "v1", type: "video", src: "movie.mp4", fit: "cover",
  x: 0, y: 0, w: 1080, h: 1920, rotation: 0, opacity: 1,
  startMs: 1000, durationMs: 4000,
  sourceStartMs: 5000, sourceEndMs: 9000,
  mediaDurationMs: 12000, playbackRate: 1, volume: 1,
};

describe("video editing engine", () => {
  it("advances the source in-point when left trimming", () => {
    const next = applyVideoTimelineEdit(video, 5000, 2000, 3000, "trim-left");
    expect(next.startMs).toBe(2000);
    expect(next.durationMs).toBe(3000);
    expect(next.sourceStartMs).toBe(6000);
    expect(next.sourceEndMs).toBe(9000);
  });

  it("changes the source out-point when right trimming", () => {
    const next = applyVideoTimelineEdit(video, 5000, 1000, 2500, "trim-right");
    expect(next.sourceStartMs).toBe(5000);
    expect(next.sourceEndMs).toBe(7500);
  });

  it("splits one source window into two contiguous clips", () => {
    const split = splitVideoElement(video, 3000, "v2", 5000);
    expect(split).not.toBeNull();
    const [left, right] = split!;
    expect(left.durationMs).toBe(2000);
    expect(left.sourceEndMs).toBe(7000);
    expect(right.startMs).toBe(3000);
    expect(right.sourceStartMs).toBe(7000);
    expect(right.sourceEndMs).toBe(9000);
  });
});
