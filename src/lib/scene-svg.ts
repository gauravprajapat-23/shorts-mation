import { CANVAS_DIMS, renderText } from "@/lib/editor-defaults";
import { computeCamera, computeElementFrame, effectiveSceneDurationMs, localSceneTime, sceneTransitionOverlayOpacity } from "@/lib/animate";
import type { EditorDocument, EditorElement, ImageElement, ShapeElement, TextElement } from "@/lib/types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function fitText(text: string, maxWidth: number, maxHeight: number, startSize: number): { lines: string[]; fontSize: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [""], fontSize: startSize };
  let size = startSize;
  const minSize = Math.max(18, Math.floor(startSize * 0.4));
  for (let attempt = 0; attempt < 12; attempt++) {
    const avgChar = size * 0.55;
    const maxChars = Math.max(1, Math.floor(maxWidth / avgChar));
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const tentative = current ? `${current} ${w}` : w;
      if (tentative.length <= maxChars) current = tentative;
      else {
        if (current) lines.push(current);
        if (w.length > maxChars) { for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars)); current = ""; }
        else current = w;
      }
    }
    if (current) lines.push(current);
    const totalH = lines.length * size * 1.15;
    if (totalH <= maxHeight || size <= minSize) return { lines, fontSize: size };
    size = Math.max(minSize, Math.floor(size * 0.9));
  }
  return { lines: [text], fontSize: size };
}

function renderElement(el: EditorElement, tLocal: number, sceneDur: number, vars: Record<string, string>, includeVideo: boolean): string {
  const f = computeElementFrame(el, tLocal, sceneDur);
  if (!f.visible || f.opacity <= 0.001) return "";
  const cx = el.w / 2, cy = el.h / 2;
  // scale around element center
  const tr = `translate(${f.x + cx * (1 - f.scale)} ${f.y + cy * (1 - f.scale)}) scale(${f.scale}) rotate(${f.rotation} ${cx} ${cy})`;
  const filter = f.blurPx > 0.1 ? ` filter="blur(${f.blurPx.toFixed(1)}px)"` : "";
  const openG = `<g transform="${tr}" opacity="${f.opacity.toFixed(3)}"${filter}>`;

  if (el.type === "shape") {
    const s = el as ShapeElement;
    const body = s.shape === "ellipse"
      ? `<ellipse cx="${s.w/2}" cy="${s.h/2}" rx="${s.w/2}" ry="${s.h/2}" fill="${s.fill}"/>`
      : `<rect width="${s.w}" height="${s.h}" fill="${s.fill}" rx="${s.radius ?? 0}"/>`;
    return `${openG}${body}</g>`;
  }

  if (el.type === "text") {
    const t = el as TextElement;
    let raw = renderText(t.text, vars);
    if (f.visibleChars !== undefined) raw = raw.slice(0, f.visibleChars);
    else if (f.visibleWords !== undefined) raw = raw.split(/\s+/).slice(0, f.visibleWords).join(" ");
    const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
    const xPos = t.align === "left" ? 0 : t.align === "right" ? t.w : t.w / 2;
    const stroke = t.stroke ? ` stroke="${esc(t.stroke)}" stroke-width="6" paint-order="stroke fill"` : "";
    const { lines, fontSize } = fitText(raw || " ", t.w, t.h, t.fontSize);
    const lineHeight = fontSize * 1.15;
    const totalH = lineHeight * lines.length;
    const startY = (t.h - totalH) / 2 + fontSize * 0.85;
    const tspans = lines.map((ln, i) => `<tspan x="${xPos}" y="${startY + i * lineHeight}">${esc(ln)}</tspan>`).join("");
    return `${openG}<text text-anchor="${anchor}" fill="${t.color}" font-family="${esc(t.fontFamily)}, sans-serif" font-size="${fontSize}" font-weight="${t.fontWeight}"${stroke}>${tspans}</text></g>`;
  }

  if (el.type === "image") {
    const im = el as ImageElement;
    const src = im.src.startsWith("{{") ? "" : im.src;
    if (!src) return "";
    return `${openG}<image href="${esc(src)}" width="${im.w}" height="${im.h}" preserveAspectRatio="${im.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/></g>`;
  }

  if (el.type === "video" && includeVideo) {
    return `${openG}<rect width="${el.w}" height="${el.h}" fill="#000"/></g>`;
  }
  return "";
}

export function buildSceneSvgAtTime(opts: {
  doc: EditorDocument;
  tMs: number;
  vars: Record<string, string>;
  includeBackground?: boolean;
  includeVideo?: boolean;
}): string {
  const { doc, tMs, vars } = opts;
  const includeBg = opts.includeBackground ?? false;
  const includeVideo = opts.includeVideo ?? false;
  const dims = CANVAS_DIMS[doc.aspect];
  const { sceneIndex, localMs } = localSceneTime(doc.scenes, tMs);
  const scene = doc.scenes[sceneIndex];
  if (!scene) return "";
  const cam = computeCamera(scene, localMs);
  const camTr = `translate(${dims.w/2 + cam.tx} ${dims.h/2 + cam.ty}) scale(${cam.scale}) translate(${-dims.w/2} ${-dims.h/2})`;
  const parts: string[] = [];
  const sceneDur = effectiveSceneDurationMs(scene);
  for (const el of scene.elements) parts.push(renderElement(el, localMs, sceneDur, vars, includeVideo));
  const bg = includeBg ? `<rect width="${dims.w}" height="${dims.h}" fill="${scene.background ?? "#000"}"/>` : "";
  const fade = sceneTransitionOverlayOpacity(scene, localMs);
  const fadeRect = fade > 0.001 ? `<rect width="${dims.w}" height="${dims.h}" fill="#000" opacity="${fade.toFixed(3)}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}" overflow="hidden">${bg}<g transform="${camTr}">${parts.join("")}</g>${fadeRect}</svg>`;
}
