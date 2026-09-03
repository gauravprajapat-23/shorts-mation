import { describe, expect, it } from "vitest";
import { estimateRenderCostUsd, retryBackoffMs, shouldDeadLetter } from "./render-reliability";

describe("V2.18 render reliability", () => {
  it("estimates cost from duration", () => expect(estimateRenderCostUsd(60_000, 0.12)).toBe(0.12));
  it("backs off exponentially", () => {
    expect(retryBackoffMs(1, 60)).toBe(60_000);
    expect(retryBackoffMs(2, 60)).toBe(120_000);
    expect(retryBackoffMs(3, 60)).toBe(240_000);
  });
  it("dead letters at the configured retry limit", () => {
    expect(shouldDeadLetter(2, 3)).toBe(false);
    expect(shouldDeadLetter(3, 3)).toBe(true);
  });
});
