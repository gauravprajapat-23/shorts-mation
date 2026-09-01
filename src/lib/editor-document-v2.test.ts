import { describe, expect, it } from "vitest";
import { migrateDocumentV1ToV2, syncV2Timeline } from "@/lib/editor-document-v2";
import type { EditorDocumentV1, EditorDocumentV2 } from "@/lib/types";

const legacy: EditorDocumentV1 = {
  version: 1,
  aspect: "9:16",
  variables: ["headline"],
  scenes: [
    {
      id: "scene_1",
      name: "Hook",
      durationMs: 5000,
      background: "#000000",
      elements: [
        {
          id: "text_1",
          type: "text",
          text: "{{headline}}",
          x: 0,
          y: 0,
          w: 500,
          h: 120,
          rotation: 0,
          opacity: 1,
          fontFamily: "Inter",
          fontSize: 64,
          fontWeight: 800,
          color: "#fff",
          align: "center",
        },
      ],
    },
  ],
};

describe("EditorDocument V2 migration", () => {
  it("migrates V1 without losing scenes, variables, or elements", () => {
    const doc = migrateDocumentV1ToV2(legacy);
    expect(doc.version).toBe(2);
    expect(doc.width).toBe(1080);
    expect(doc.height).toBe(1920);
    expect(doc.fps).toBe(30);
    expect(doc.variables).toEqual(["headline"]);
    expect(doc.scenes[0].elements[0].startMs).toBe(0);
    expect(doc.scenes[0].elements[0].durationMs).toBe(5000);
    expect(doc.tracks.find((t) => t.kind === "text")?.clips).toHaveLength(1);
  });

  it("derives absolute track clips from relative scene timing", () => {
    const doc = migrateDocumentV1ToV2(legacy);
    const timed: EditorDocumentV2 = {
      ...doc,
      scenes: doc.scenes.map((scene) => ({
        ...scene,
        elements: scene.elements.map((el) => ({ ...el, startMs: 1200, durationMs: 1800 })),
      })),
    };
    const synced = syncV2Timeline(timed);
    const clip = synced.tracks.find((t) => t.kind === "text")?.clips[0];
    expect(clip?.startMs).toBe(1200);
    expect(clip?.durationMs).toBe(1800);
  });
  it("preserves project-clip start times near the end instead of shifting them earlier", () => {
    const base = migrateDocumentV1ToV2(legacy);
    const synced = syncV2Timeline({
      ...base,
      captionClips: [{
        id: "late_caption", name: "Late", startMs: 4975, durationMs: 200, x: 40, y: 1400, w: 1000, h: 160,
        words: [{ id: "w1", text: "End", startMs: 0, endMs: 25 }],
        style: { preset: "clean", animation: "minimal", fontFamily: "Inter", fontSize: 48, fontWeight: 700, color: "#fff", activeColor: "#fff", background: "transparent" },
      }],
      effectClips: [{ id: "late_fx", name: "Late FX", kind: "flash", startMs: 4980, durationMs: 200, intensity: .5, opacity: .5 }],
    });
    expect(synced.captionClips[0]?.startMs).toBe(4975);
    expect(synced.captionClips[0]?.durationMs).toBe(25);
    expect(synced.effectClips[0]?.startMs).toBe(4980);
    expect(synced.effectClips[0]?.durationMs).toBe(20);
  });

});
