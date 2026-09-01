import { describe, expect, it } from "vitest";
import { evaluateTimelineFrame, timelineDurationMs } from "@/lib/timeline-engine";
import type { EditorDocumentV2 } from "@/lib/types";

const enabled = process.env.RUN_STRESS_TESTS === "1";
const suite = enabled ? describe : describe.skip;

suite("V2.14 long timeline stress", () => {
  it("evaluates a 10-minute / 240-scene document across 10k frames without state corruption", () => {
    const scenes: EditorDocumentV2["scenes"] = Array.from({ length: 240 }, (_, i) => ({
      id: `s${i}`, name: `Scene ${i}`, durationMs: 2500, background: i % 2 ? "#111" : "#222",
      elements: [{ id: `t${i}`, type: "text", text: `Scene ${i}`, x: 80, y: 120, w: 920, h: 220, rotation: 0, opacity: 1, fontFamily: "Inter", fontSize: 64, fontWeight: 800, color: "#fff", align: "center", startMs: 0, durationMs: 2500 }],
    }));
    const doc: EditorDocumentV2 = { version: 2, aspect: "9:16", width: 1080, height: 1920, fps: 30, durationMs: 600000, variables: [], tracks: [], audioClips: [], captionClips: [], effectClips: [], audioMix: { duckingEnabled: false, duckLevel: 1, attackMs: 0, releaseMs: 0 }, scenes };
    expect(timelineDurationMs(doc)).toBe(600000);
    let checksum = 0;
    for (let i = 0; i < 10000; i++) {
      const frame = evaluateTimelineFrame(doc, (i / 9999) * 599999);
      checksum += frame.sceneIndex + frame.visibleElements.length;
    }
    expect(checksum).toBeGreaterThan(0);
    expect(evaluateTimelineFrame(doc, 599999).scene?.id).toBe("s239");
  });
});
