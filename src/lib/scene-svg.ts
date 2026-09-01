import { CANVAS_DIMS, renderText } from "@/lib/editor-defaults";
import { evaluateTimelineFrame } from "@/lib/timeline-engine";
import type { EditorDocument, EditorElement, ImageElement, ShapeElement, TextElement } from "@/lib/types";
import type { TimelineElementState } from "@/lib/timeline-engine";
import { layoutText } from "@/lib/text-design";
import { cssFilterForLook, resolveMediaLook } from "@/lib/effects";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function parseLegacyShadow(shadow?: string): { x: number; y: number; blur: number; color: string; opacity: number } | null {
  if (!shadow) return null;
  const m = shadow.trim().match(/^(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(\d+(?:\.\d+)?)(?:px)?\s+(.+)$/i);
  if (!m) return null;
  let color = m[4]!.trim();
  let opacity = 1;
  const rgba = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (rgba) { color = `rgb(${rgba[1]},${rgba[2]},${rgba[3]})`; opacity = Math.max(0, Math.min(1, Number(rgba[4]))); }
  return { x: Number(m[1]), y: Number(m[2]), blur: Number(m[3]), color, opacity };
}

function starPoints(w: number, h: number, points = 5): string {
  const cx = w / 2, cy = h / 2, ro = Math.min(w, h) / 2, ri = ro * 0.42;
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = (Math.PI / points) * i - Math.PI / 2;
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return out.join(" ");
}

function renderElement(state: TimelineElementState, vars: Record<string, string>, includeVideo: boolean): string {
  const el = state.element;
  const f = state.frame;
  if (!state.visible) return "";
  const cx = el.w / 2, cy = el.h / 2;
  // scale around element center
  const tr = `translate(${f.x + cx * (1 - f.scale)} ${f.y + cy * (1 - f.scale)}) scale(${f.scale}) rotate(${f.rotation} ${cx} ${cy})`;
  const filter = f.blurPx > 0.1 ? ` filter="blur(${f.blurPx.toFixed(1)}px)"` : "";
  const openG = `<g transform="${tr}" opacity="${f.opacity.toFixed(3)}"${filter}>`;

  if (el.type === "shape") {
    const s = el as ShapeElement;
    const paint = `fill="${s.fill}" fill-opacity="${s.fillOpacity ?? 1}"${s.stroke ? ` stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth ?? 4}"` : ""}`;
    const body =
      s.shape === "ellipse" ? `<ellipse cx="${s.w/2}" cy="${s.h/2}" rx="${s.w/2}" ry="${s.h/2}" ${paint}/>`
      : s.shape === "triangle" ? `<polygon points="${s.w/2},0 ${s.w},${s.h} 0,${s.h}" ${paint}/>`
      : s.shape === "star" ? `<polygon points="${starPoints(s.w, s.h)}" ${paint}/>`
      : s.shape === "line" ? `<rect y="${Math.max(0, s.h/2 - (s.strokeWidth ?? 6)/2)}" width="${s.w}" height="${s.strokeWidth ?? 6}" fill="${s.fill}" fill-opacity="${s.fillOpacity ?? 1}"/>`
      : `<rect width="${s.w}" height="${s.h}" ${paint} rx="${s.radius ?? 0}"/>`;
    return `${openG}${body}</g>`;
  }

  if (el.type === "text") {
    const t = el as TextElement;
    let raw = renderText(t.text, vars);
    if (t.textTransform === "uppercase") raw = raw.toUpperCase();
    else if (t.textTransform === "lowercase") raw = raw.toLowerCase();
    if (f.visibleChars !== undefined) raw = raw.slice(0, f.visibleChars);
    else if (f.visibleWords !== undefined) raw = raw.split(/\s+/).slice(0, f.visibleWords).join(" ");
    const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
    const padX = Math.max(0, t.backgroundPaddingX ?? 8);
    const padY = Math.max(0, t.backgroundPaddingY ?? 8);
    const xPos = t.align === "left" ? padX : t.align === "right" ? t.w - padX : t.w / 2;
    const stroke = t.stroke ? ` stroke="${esc(t.stroke)}" stroke-width="${t.strokeWidth ?? 6}" paint-order="stroke fill" stroke-linejoin="round"` : "";
    const layout = layoutText(t, raw || " ");
    const { lines, fontSize, lineHeightPx: lineHeight } = layout;
    const totalH = lineHeight * lines.length;
    const innerTop = padY;
    const innerHeight = Math.max(1, t.h - padY * 2);
    const vTop = t.vAlign === "top" ? innerTop : t.vAlign === "bottom" ? innerTop + innerHeight - totalH : innerTop + (innerHeight - totalH) / 2;
    const startY = vTop + fontSize * 0.85;
    const tspans = lines.map((ln, i) => `<tspan x="${xPos}" y="${startY + i * lineHeight}">${esc(ln)}</tspan>`).join("");
    const extra = `${t.italic ? ` font-style="italic"` : ""}${t.letterSpacing ? ` letter-spacing="${t.letterSpacing}"` : ""}`;
    const safeId = t.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const textGradId = `text-grad-${safeId}`;
    const bgGradId = `bg-grad-${safeId}`;
    const shadowId = `text-shadow-${safeId}`;
    const clipId = `text-clip-${safeId}`;
    const defs: string[] = [];
    if (t.clipInsetPct) {
      const left = Math.max(0, Math.min(100, t.clipInsetPct.left ?? 0));
      const right = Math.max(0, Math.min(100, t.clipInsetPct.right ?? 0));
      const top = Math.max(0, Math.min(100, t.clipInsetPct.top ?? 0));
      const bottom = Math.max(0, Math.min(100, t.clipInsetPct.bottom ?? 0));
      const x = t.w * left / 100;
      const y = t.h * top / 100;
      const width = Math.max(0, t.w * (100 - left - right) / 100);
      const height = Math.max(0, t.h * (100 - top - bottom) / 100);
      defs.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);
    }
    if (t.textGradient) defs.push(`<linearGradient id="${textGradId}" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${t.textGradient.angle ?? 90} .5 .5)"><stop offset="0%" stop-color="${esc(t.textGradient.from)}"/><stop offset="100%" stop-color="${esc(t.textGradient.to)}"/></linearGradient>`);
    if (t.backgroundGradient) defs.push(`<linearGradient id="${bgGradId}" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${t.backgroundGradient.angle ?? 90} .5 .5)"><stop offset="0%" stop-color="${esc(t.backgroundGradient.from)}"/><stop offset="100%" stop-color="${esc(t.backgroundGradient.to)}"/></linearGradient>`);
    const shadowLayers = [...(t.shadows ?? [])];
    const legacyShadow = parseLegacyShadow(t.shadow);
    if (legacyShadow) shadowLayers.push(legacyShadow);
    if (t.glow?.blur) shadowLayers.push({ x: 0, y: 0, blur: t.glow.blur, color: t.glow.color, opacity: Math.min(1, 0.45 * (t.glow.intensity ?? 1)) });
    if (shadowLayers.length) {
      const drops = shadowLayers.map((sh) => `<feDropShadow dx="${sh.x}" dy="${sh.y}" stdDeviation="${Math.max(0, sh.blur / 2)}" flood-color="${esc(sh.color)}" flood-opacity="${Math.max(0, Math.min(1, sh.opacity ?? 1))}"/>`).join("");
      defs.push(`<filter id="${shadowId}" x="-60%" y="-60%" width="220%" height="220%">${drops}</filter>`);
    }
    const defsSvg = defs.length ? `<defs>${defs.join("")}</defs>` : "";
    const bgFill = t.backgroundGradient ? `url(#${bgGradId})` : (t.background && t.background !== "transparent" ? esc(t.background) : "transparent");
    const bgRect = bgFill !== "transparent" || (t.backgroundBorderWidth ?? 0) > 0
      ? `<rect width="${t.w}" height="${t.h}" fill="${bgFill}" fill-opacity="${t.backgroundOpacity ?? 1}" rx="${t.backgroundRadius ?? 12}"${(t.backgroundBorderWidth ?? 0) > 0 ? ` stroke="${esc(t.backgroundBorderColor ?? "#FFFFFF")}" stroke-width="${t.backgroundBorderWidth}"` : ""}/>` : "";
    const fill = t.textGradient ? `url(#${textGradId})` : esc(t.color);
    const shadowFilter = shadowLayers.length ? ` filter="url(#${shadowId})"` : "";
    const content = `${bgRect}<text text-anchor="${anchor}" fill="${fill}" font-family="${esc(t.fontFamily)}, sans-serif" font-size="${fontSize}" font-weight="${t.fontWeight}"${extra}${stroke}${shadowFilter}>${tspans}</text>`;
    return `${openG}${defsSvg}${t.clipInsetPct ? `<g clip-path="url(#${clipId})">${content}</g>` : content}</g>`;
  }

  if (el.type === "image") {
    const im = el as ImageElement;
    const src = im.src.startsWith("{{") ? "" : im.src;
    if (!src) return "";
    const look = resolveMediaLook(im.filterPreset, im.colorAdjustments);
    const style = cssFilterForLook(look);
    const localId = `media-${im.id.replace(/[^a-zA-Z0-9_-]/g,"_")}`;
    const vignette = look.vignette > .01 ? `<defs><radialGradient id="${localId}-v"><stop offset="48%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="1"/></radialGradient></defs><rect width="${im.w}" height="${im.h}" fill="url(#${localId}-v)" opacity="${look.vignette}"/>` : "";
    const grain = look.grain > .01 ? `<defs><filter id="${localId}-g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7"/></filter></defs><rect width="${im.w}" height="${im.h}" filter="url(#${localId}-g)" opacity="${look.grain*.28}" style="mix-blend-mode:overlay"/>` : "";
    return `${openG}<g style="filter:${esc(style)}" transform="translate(${(f.cropX/100)*im.w} ${(f.cropY/100)*im.h}) scale(${f.cropScale}) translate(${im.w*(1-f.cropScale)/2} ${im.h*(1-f.cropScale)/2})"><image href="${esc(src)}" width="${im.w}" height="${im.h}" preserveAspectRatio="${im.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/></g>${vignette}${grain}</g>`;
  }

  if (el.type === "video" && includeVideo) {
    return `${openG}<rect width="${el.w}" height="${el.h}" fill="#000"/></g>`;
  }
  return "";
}

function renderEffectSvg(effect: import("@/lib/effects").EffectState, w: number, h: number): string {
  const opacity = Math.max(0, Math.min(1, (effect.opacity ?? 1) * effect.intensity));
  const id = `fx-${effect.id.replace(/[^a-zA-Z0-9_-]/g,"_")}`;
  if (effect.kind === "vignette") return `<defs><radialGradient id="${id}"><stop offset="45%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="1"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})" opacity="${opacity}"/>`;
  if (effect.kind === "grain") return `<defs><filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" seed="${effect.seed ?? 7}"/></filter></defs><rect width="${w}" height="${h}" filter="url(#${id})" opacity="${opacity*.32}" style="mix-blend-mode:overlay"/>`;
  if (effect.kind === "light-leak") { const cx=20+60*effect.progress; return `<defs><radialGradient id="${id}" cx="${cx}%" cy="15%"><stop offset="0%" stop-color="${esc(effect.color ?? "#FF7A18")}" stop-opacity=".95"/><stop offset="70%" stop-color="${esc(effect.color ?? "#FF7A18")}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})" opacity="${opacity}" style="mix-blend-mode:screen"/>`; }
  if (effect.kind === "flash") return `<rect width="${w}" height="${h}" fill="#fff" opacity="${(opacity*Math.sin(effect.progress*Math.PI)).toFixed(3)}"/>`;
  return `<g opacity="${(opacity*.45).toFixed(3)}"><rect width="${w}" height="${h}" fill="#ff0055"/><rect x="${Math.sin(effect.localMs/35)*12}" width="${w}" height="${h}" fill="#00e5ff" opacity=".5"/></g>`;
}

export function buildSceneSvgAtTime(opts: {
  doc: EditorDocument;
  tMs: number;
  vars: Record<string, string>;
  includeBackground?: boolean;
  includeVideo?: boolean;
}): string {
  const includeBg = opts.includeBackground ?? false;
  const includeVideo = opts.includeVideo ?? false;
  const dims = CANVAS_DIMS[opts.doc.aspect];
  const frame = evaluateTimelineFrame(opts.doc, opts.tMs, opts.vars);
  const scene = frame.scene;
  if (!scene) return "";
  const cam = frame.camera;
  const trn = frame.transition;
  const camTr = `translate(${dims.w/2 + cam.tx + trn.tx} ${dims.h/2 + cam.ty + trn.ty}) scale(${cam.scale * trn.scale}) translate(${-dims.w/2} ${-dims.h/2})`;
  const parts = frame.visibleElements.map((state) => renderElement(state, opts.vars, includeVideo));
  const captions = frame.visibleCaptions.map(renderCaption);
  const bg = includeBg ? `<rect width="${dims.w}" height="${dims.h}" fill="${scene.background ?? "#000"}"/>` : "";
  const fade = frame.transitionOverlayOpacity;
  const fadeRect = fade > 0.001 ? `<rect width="${dims.w}" height="${dims.h}" fill="#000" opacity="${fade.toFixed(3)}"/>` : "";
  const transitionFilter = trn.blur > 0.1 ? ` style="filter:blur(${trn.blur.toFixed(2)}px)"` : "";
  const fx = frame.visibleEffects.map((effect) => renderEffectSvg(effect, dims.w, dims.h)).join("");
  const flash = trn.flash > .001 ? `<rect width="${dims.w}" height="${dims.h}" fill="#fff" opacity="${trn.flash.toFixed(3)}"/>` : "";
  const glitch = trn.glitch > .001 ? `<g opacity="${(trn.glitch*.35).toFixed(3)}"><rect width="${dims.w}" height="${dims.h}" fill="#ff0055"/><rect x="12" width="${dims.w}" height="${dims.h}" fill="#00ddff" opacity=".45"/></g>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}" overflow="hidden">${bg}<g transform="${camTr}" opacity="${trn.opacity.toFixed(3)}"${transitionFilter}>${parts.join("")}</g>${captions.join("")}${fx}${flash}${glitch}${fadeRect}</svg>`;
}


function renderCaption(state: import("@/lib/timeline-engine").TimelineCaptionState): string {
  const c = state.clip;
  const style = c.style;
  const radius = style.radius ?? 12;
  if (!state.words.length) return "";
  const perLine = Math.max(2, style.maxWordsPerLine ?? 6);
  const lines: typeof state.words[] = [];
  for (let i = 0; i < state.words.length; i += perLine) lines.push(state.words.slice(i, i + perLine));
  const lineHeight = style.fontSize * 1.18;
  const totalH = lines.length * lineHeight;
  const firstY = c.y + (c.h - totalH) / 2 + style.fontSize * 0.9;
  const stroke = style.stroke ? ` stroke="${esc(style.stroke)}" stroke-width="${style.strokeWidth ?? 5}" paint-order="stroke fill"` : "";
  const bg = style.background && style.background !== "transparent" ? `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${radius}" fill="${esc(style.background)}"/>` : "";
  const texts = lines.map((line, lineIndex) => {
    const words = line.map((word, i) => {
      const active = word.active;
      const fill = active ? style.activeColor : style.color;
      const scale = style.animation === "pop" && active ? 1 + 0.16 * Math.sin(Math.min(1, word.progress) * Math.PI) : 1;
      const opacity = style.animation === "karaoke" && !word.spoken && !active ? 0.62 : 1;
      return `<tspan fill="${esc(fill)}" opacity="${opacity.toFixed(2)}" font-size="${(style.fontSize * scale).toFixed(2)}">${esc((style.uppercase ? word.text.toUpperCase() : word.text) + (i < line.length - 1 ? " " : ""))}</tspan>`;
    }).join("");
    return `<text x="${c.x + c.w / 2}" y="${firstY + lineIndex * lineHeight}" text-anchor="middle" fill="${esc(style.color)}" font-family="${esc(style.fontFamily)}, sans-serif" font-size="${style.fontSize}" font-weight="${style.fontWeight}"${stroke}>${words}</text>`;
  }).join("");
  return `${bg}${texts}`;
}

/** Background-only frame used by renderers so scene colors stay below video layers. */
export function buildSceneBackgroundSvgAtTime(opts: {
  doc: EditorDocument;
  tMs: number;
  vars?: Record<string, string>;
}): string {
  const dims = CANVAS_DIMS[opts.doc.aspect];
  const frame = evaluateTimelineFrame(opts.doc, opts.tMs, opts.vars ?? {});
  const background = frame.scene?.background ?? "#000";
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"><rect width="${dims.w}" height="${dims.h}" fill="${esc(background)}"/></svg>`;
}
