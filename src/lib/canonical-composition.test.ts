import { describe, expect, it } from "vitest";
import { blankDocument } from "@/lib/editor-defaults";
import { createCanonicalComposition, parseCanonicalComposition } from "@/lib/canonical-composition";

function fixedOptions() {
  return { compositionId: "cmp_test", createdAt: "2026-09-07T00:00:00.000Z" };
}

describe("Phase 0 canonical composition contract", () => {
  it("normalizes an editor document into a versioned renderer-independent envelope", () => {
    const composition = createCanonicalComposition(blankDocument(), fixedOptions());
    expect(composition.schema).toBe("shorts-mation/composition");
    expect(composition.version).toBe(1);
    expect(composition.document.version).toBe(2);
    expect(composition.document.durationMs).toBeGreaterThan(0);
    expect(parseCanonicalComposition(composition).compositionId).toBe("cmp_test");
  });

  it("rejects duplicate identities so renderers cannot disagree about layer ownership", () => {
    const doc = blankDocument();
    doc.scenes[0]!.elements = [
      { id: "dup", type: "shape", shape: "rect", fill: "#fff", x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1 },
      { id: "dup", type: "shape", shape: "rect", fill: "#000", x: 10, y: 10, w: 100, h: 100, rotation: 0, opacity: 1 },
    ];
    expect(() => createCanonicalComposition(doc, fixedOptions())).toThrow(/Duplicate id/);
  });

  it("rejects browser-only blob media references", () => {
    const doc = blankDocument();
    doc.scenes[0]!.elements = [{ id: "img", type: "image", src: "blob:http://localhost/123", fit: "cover", x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1 }];
    expect(() => createCanonicalComposition(doc, fixedOptions())).toThrow(/blob: URLs/);
  });
});
