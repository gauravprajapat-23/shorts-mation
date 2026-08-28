import { describe, expect, it } from "vitest";
import { layoutText } from "@/lib/text-design";
import type { TextElement } from "@/lib/types";

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: "text-1", type: "text", text: "A professional shorts headline that needs to fit",
    x: 0, y: 0, w: 420, h: 180, rotation: 0, opacity: 1,
    fontFamily: "Inter", fontSize: 90, fontWeight: 900, color: "#fff", align: "center",
    ...overrides,
  };
}

describe("V2.7 text layout", () => {
  it("shrinks text when auto-fit is enabled", () => {
    const result = layoutText(text({ autoFit: true, minFontSize: 24, maxLines: 3 }), "A professional shorts headline that needs to fit");
    expect(result.fontSize).toBeLessThan(90);
    expect(result.fontSize).toBeGreaterThanOrEqual(24);
    expect(result.lines.length).toBeLessThanOrEqual(3);
  });

  it("keeps authored size when auto-fit is disabled", () => {
    const result = layoutText(text({ autoFit: false, maxLines: 2 }), "A professional shorts headline that needs to fit");
    expect(result.fontSize).toBe(90);
    expect(result.lines.length).toBeLessThanOrEqual(2);
  });

  it("reserves background padding while fitting", () => {
    const loose = layoutText(text({ autoFit: true, backgroundPaddingX: 0 }), "ONE TWO THREE FOUR");
    const padded = layoutText(text({ autoFit: true, backgroundPaddingX: 70 }), "ONE TWO THREE FOUR");
    expect(padded.fontSize).toBeLessThanOrEqual(loose.fontSize);
  });
});
