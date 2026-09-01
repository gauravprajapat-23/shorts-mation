import type { AspectRatio, EditorDocument, EditorDocumentV2, EditorScene } from "./types";
import { syncV2Timeline } from "./editor-document-v2";

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

export function blankDocument(aspect: AspectRatio = "9:16"): EditorDocumentV2 {
  const dims = CANVAS_DIMS[aspect];
  return syncV2Timeline({
    version: 2,
    aspect,
    width: dims.w,
    height: dims.h,
    fps: 30,
    durationMs: 5000,
    scenes: [blankScene()],
    tracks: [],
    audioClips: [],
    captionClips: [],
  effectClips: [],
    audioMix: { duckingEnabled: true, duckLevel: 0.22, attackMs: 180, releaseMs: 320 },
    audio: { volume: 0.7 },
    variables: ["headline", "subheadline", "cta"],
    automationVariables: [
      { id: "var_headline", name: "headline", label: "Headline", type: "text", required: true, validation: { maxLength: 180 } },
      { id: "var_subheadline", name: "subheadline", label: "Subheadline", type: "text", defaultValue: "" },
      { id: "var_cta", name: "cta", label: "CTA", type: "text", defaultValue: "Follow for more" },
    ],
    components: [],
  });
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