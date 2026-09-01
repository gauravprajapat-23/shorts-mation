import { describe, expect, it } from "vitest";
import { evaluateEffectClips, evaluateTransition, resolveMediaLook } from "@/lib/effects";

describe("V2.9 effects", () => {
  it("merges presets with authored color adjustments", () => {
    const look = resolveMediaLook("cinematic", { saturation: 1.25 });
    expect(look.contrast).toBeGreaterThan(1);
    expect(look.saturation).toBe(1.25);
  });
  it("evaluates transition motion deterministically", () => {
    expect(evaluateTransition("whip", 0).tx).toBeGreaterThan(400);
    expect(evaluateTransition("whip", 420).tx).toBe(0);
  });
  it("activates effect clips only inside their project range", () => {
    const clip = { id:"fx", name:"grain", kind:"grain" as const, startMs:1000, durationMs:500, intensity:.5 };
    expect(evaluateEffectClips([clip], 900)[0]?.visible).toBe(false);
    expect(evaluateEffectClips([clip], 1200)[0]?.visible).toBe(true);
  });
});
