import { describe, expect, it } from "vitest";
import { createCaptionClip, wordsFromText } from "@/lib/captions";
import { evaluateTimelineFrame } from "@/lib/timeline-engine";
import type { EditorDocumentV2 } from "@/lib/types";

describe("professional captions", () => {
  it("assigns continuous word timing", () => {
    const words = wordsFromText("Make every word count", 2000);
    expect(words[0]?.startMs).toBe(0);
    expect(words.at(-1)?.endMs).toBe(2000);
    expect(words.every((word) => word.endMs > word.startMs)).toBe(true);
  });

  it("evaluates the active word from the shared project playhead", () => {
    const clip = createCaptionClip("one two three", 1000, 1800, "karaoke");
    const doc: EditorDocumentV2 = { version: 2, aspect: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 5000, variables: [], tracks: [], scenes: [{ id: "s", name: "Scene", durationMs: 5000, background: "#000", elements: [] }], audioClips: [], captionClips: [clip], audioMix: { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 } };
    const frame = evaluateTimelineFrame(doc, 1300);
    expect(frame.visibleCaptions).toHaveLength(1);
    expect(frame.visibleCaptions[0]!.activeWordIndex).toBeGreaterThanOrEqual(0);
  });
});
