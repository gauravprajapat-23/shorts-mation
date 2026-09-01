import { describe, expect, it } from "vitest";
import { parseEditorDocument } from "@/lib/editor-document-schema";

describe("editor document runtime schema", () => {
  it("accepts a minimal valid V1 document", () => {
    expect(parseEditorDocument({ version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "S", durationMs: 1000, background: "#000", elements: [] }] }).version).toBe(1);
  });
  it("rejects invalid durations before persistence/rendering", () => {
    expect(() => parseEditorDocument({ version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "S", durationMs: -1, background: "#000", elements: [] }] })).toThrow(/durationMs/);
  });
  it("rejects non-finite element geometry", () => {
    expect(() => parseEditorDocument({ version: 1, aspect: "9:16", variables: [], scenes: [{ id: "s", name: "S", durationMs: 1000, background: "#000", elements: [{ id: "t", type: "text", x: 0, y: 0, w: NaN, h: 100, rotation: 0, opacity: 1, text: "x", fontFamily: "Inter", fontSize: 30, fontWeight: 700, color: "#fff", align: "center" }] }] })).toThrow();
  });
});
