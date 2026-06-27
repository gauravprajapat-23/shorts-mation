import type { AspectRatio, EditorDocument, EditorScene } from "./types";

let __id = 0;
export const uid = (p = "el") => `${p}_${Date.now().toString(36)}_${(__id++).toString(36)}`;

export const CANVAS_DIMS: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
};

export function blankScene(): EditorScene {
  return { id: uid("scene"), name: "Scene 1", durationMs: 5000, background: "#0A0A0A", elements: [] };
}

export function blankDocument(aspect: AspectRatio = "9:16"): EditorDocument {
  return {
    version: 1,
    aspect,
    scenes: [blankScene()],
    audio: { volume: 0.7 },
    variables: ["headline", "subheadline", "cta"],
  };
}

export function renderText(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? `{{${key}}}` : String(v);
  });
}

export function extractVariables(doc: EditorDocument): string[] {
  const set = new Set<string>(doc.variables);
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  for (const s of doc.scenes) {
    for (const el of s.elements) {
      const haystack = el.type === "text" ? el.text : el.type === "image" ? el.src : "";
      for (const m of haystack.matchAll(re)) set.add(m[1]);
    }
  }
  return Array.from(set);
}