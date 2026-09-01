import { describe, expect, it } from "vitest";
import { analyzeRetention, applyRetentionPreset } from "@/lib/retention";
import type { EditorDocumentV2 } from "@/lib/types";

const doc: EditorDocumentV2 = { version:2, aspect:"9:16", width:1080, height:1920, fps:30, durationMs:8000, tracks:[], audioClips:[], captionClips:[], effectClips:[], audioMix:{duckingEnabled:true,duckLevel:.22,attackMs:180,releaseMs:320}, variables:[], scenes:[
  { id:"s1", name:"Opening", durationMs:4000, background:"#000", elements:[] },
  { id:"s2", name:"Main tip", durationMs:4000, background:"#000", elements:[] },
] };

describe("retention intelligence", () => {
  it("infers roles and materializes an editable visual rhythm preset", () => {
    const next = applyRetentionPreset(doc, "fast-viral", (p)=>`${p}_1`);
    expect(next.scenes[0]?.role).toBe("hook");
    expect(next.scenes[1]?.role).toBe("value");
    expect(next.retention?.preset).toBe("fast-viral");
    expect(next.scenes[0]?.cameraMove).toBe("zoomIn");
  });
  it("suggests pattern interrupts and a CTA when absent", () => {
    const suggestions = analyzeRetention({ ...doc, retention: { preset:"fast-viral", enabled:true, microZoomEveryMs:2200, patternInterruptEveryMs:4200, captionEmphasis:"high", transitionIntensity:"high", ctaLeadMs:2200 } });
    expect(suggestions.some((s)=>s.kind === "pattern-interrupt")).toBe(true);
    expect(suggestions.some((s)=>s.kind === "cta")).toBe(true);
  });
  it("uses CTA-extended duration when scheduling later retention interrupts", () => {
    const timed: EditorDocumentV2 = { ...doc, scenes: [
      { id:"a", name:"Hook", role:"hook", durationMs:1000, background:"#000", elements:[] },
      { id:"b", name:"CTA", role:"cta", durationMs:1000, background:"#000", elements:[] },
      { id:"c", name:"Value", role:"value", durationMs:2000, background:"#000", elements:[] },
    ] };
    const next = applyRetentionPreset(timed, "fast-viral", (p)=>`${p}_${Math.random()}`);
    expect(next.scenes[1]?.durationMs).toBeGreaterThanOrEqual(2200);
    expect(next.effectClips.some((fx) => fx.id.startsWith("retention_") && fx.startMs >= 3200)).toBe(true);
  });

});
