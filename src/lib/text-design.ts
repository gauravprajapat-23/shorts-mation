import type { TextElement } from "@/lib/types";

export type TextLayout = { lines: string[]; fontSize: number; lineHeightPx: number; truncated: boolean };

function roughCharWidth(size: number, weight: number): number {
  const weightFactor = weight >= 800 ? 0.59 : weight >= 600 ? 0.565 : 0.54;
  return size * weightFactor;
}

/** Deterministic layout approximation shared by canvas/SVG/server renderers. */
export function layoutText(el: TextElement, text: string): TextLayout {
  const lineHeight = el.lineHeight && el.lineHeight > 0.5 ? el.lineHeight : 1.15;
  const minSize = Math.max(10, el.minFontSize ?? Math.max(18, Math.floor(el.fontSize * 0.34)));
  const autoFit = el.autoFit !== false;
  const maxLines = Math.max(1, Math.min(20, el.maxLines ?? 20));
  const padX = Math.max(0, el.backgroundPaddingX ?? 8) * 2;
  const padY = Math.max(0, el.backgroundPaddingY ?? 8) * 2;
  const maxWidth = Math.max(1, el.w - padX);
  const maxHeight = Math.max(1, el.h - padY);
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [""], fontSize: el.fontSize, lineHeightPx: el.fontSize * lineHeight, truncated: false };

  let size = el.fontSize;
  let last: TextLayout | null = null;
  for (let attempt = 0; attempt < 18; attempt++) {
    const maxChars = Math.max(1, Math.floor(maxWidth / roughCharWidth(size, el.fontWeight)));
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) current = candidate;
      else {
        if (current) lines.push(current);
        if (word.length > maxChars) {
          let rest = word;
          while (rest.length > maxChars) { lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); }
          current = rest;
        } else current = word;
      }
    }
    if (current) lines.push(current);
    const lineHeightPx = size * lineHeight;
    const fits = lines.length <= maxLines && lines.length * lineHeightPx <= maxHeight;
    last = { lines: lines.slice(0, maxLines), fontSize: size, lineHeightPx, truncated: lines.length > maxLines };
    if (fits || !autoFit || size <= minSize) break;
    size = Math.max(minSize, Math.floor(size * 0.92));
  }

  const result = last!;
  if (result.truncated && result.lines.length) {
    const i = result.lines.length - 1;
    const line = result.lines[i]!;
    result.lines[i] = line.length > 1 ? `${line.slice(0, Math.max(1, line.length - 1))}…` : "…";
  }
  return result;
}

export function cssTextShadows(el: TextElement): string | undefined {
  const parts: string[] = [];
  if (el.shadow) parts.push(el.shadow);
  for (const s of el.shadows ?? []) {
    const opacity = Math.max(0, Math.min(1, s.opacity ?? 1));
    // Preserve CSS colors while allowing opacity through color-mix on modern browsers.
    parts.push(`${s.x}px ${s.y}px ${s.blur}px color-mix(in srgb, ${s.color} ${Math.round(opacity * 100)}%, transparent)`);
  }
  if (el.glow && el.glow.blur > 0) {
    const strength = Math.max(1, Math.min(3, Math.round(el.glow.intensity ?? 1)));
    for (let i = 0; i < strength; i++) parts.push(`0 0 ${el.glow.blur * (0.65 + i * 0.35)}px ${el.glow.color}`);
  }
  return parts.length ? parts.join(", ") : undefined;
}

export function gradientCss(g?: { from: string; to: string; angle?: number }): string | undefined {
  return g ? `linear-gradient(${g.angle ?? 90}deg, ${g.from}, ${g.to})` : undefined;
}
