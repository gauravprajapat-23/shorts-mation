import { describe, expect, it } from "vitest";
import { blankDocument } from "@/lib/editor-defaults";
import { createCanonicalComposition } from "@/lib/canonical-composition";
import { assertNativeRendererSupported, certifyNativeRendererCapabilities } from "@/lib/render-capabilities";
import type { EditorDocumentV2 } from "@/lib/types";

function canonical(mutator?: (doc: EditorDocumentV2) => void) {
  const doc = blankDocument(); mutator?.(doc);
  return createCanonicalComposition(doc, { compositionId: "cap-test", createdAt: "2026-09-07T00:00:00.000Z" });
}

describe("Phase 3 Chromium + FFmpeg V3 capability certification", () => {
  it("certifies the V3 worker", () => {
    const report = certifyNativeRendererCapabilities(canonical());
    expect(report.supported).toBe(true); expect(report.renderer).toBe("native-chromium-ffmpeg-v3"); expect(report.capabilityVersion).toBe(3);
  });

  it("accepts timeline audio including mixer/ducking envelopes", () => {
    const composition = canonical((doc) => { doc.audioClips.push({ id:"music", name:"Music", src:"https://example.com/music.mp3", role:"music", startMs:0, durationMs:doc.durationMs, volume:.8, fadeInMs:250, fadeOutMs:250 }); });
    const report = certifyNativeRendererCapabilities(composition); expect(report.supported).toBe(true); expect(() => assertNativeRendererSupported(composition)).not.toThrow();
  });

  it("accepts multiple positioned/timed video layers", () => {
    const composition = canonical((doc) => { const scene=doc.scenes[0]!; scene.elements.push(
      { id:"v1", type:"video", src:"https://example.com/1.mp4", fit:"cover", x:20, y:40, w:500, h:800, rotation:8, opacity:.8, startMs:0, durationMs:Math.floor(scene.durationMs/2), sourceStartMs:500, muted:true },
      { id:"v2", type:"video", src:"https://example.com/2.mp4", fit:"contain", x:120, y:200, w:300, h:300, rotation:0, opacity:1, startMs:250, durationMs:Math.ceil(scene.durationMs/2), muted:true },
    ); });
    const report=certifyNativeRendererCapabilities(composition); expect(report.supported).toBe(true); expect(report.blockingIssues).toHaveLength(0);
  });

  it("still blocks vector geometry the worker cannot reproduce", () => {
    const composition=canonical((doc)=>{doc.scenes[0]!.elements.push({id:"star",type:"shape",shape:"star",fill:"#fff",x:0,y:0,w:100,h:100,rotation:0,opacity:1});});
    const report=certifyNativeRendererCapabilities(composition); expect(report.supported).toBe(false); expect(report.blockingIssues.map(i=>i.code)).toContain("unsupported-shape-kind");
  });
});
