import type {
  BrandKit,
  EditorDocument,
  EditorElement,
  EditorReusableComponent,
  TextElement,
} from "@/lib/types";

export const DEFAULT_BRAND_KIT: BrandKit = {
  id: "brand_default",
  name: "My Brand",
  colors: {
    primary: "#FF0033",
    secondary: "#7C3AED",
    accent: "#FFD43B",
    background: "#0A0A0A",
    text: "#FFFFFF",
  },
  typography: {
    headingFont: "Plus Jakarta Sans",
    bodyFont: "Inter",
  },
  logoSrc: "",
  watermarkSrc: "",
  socialHandle: "@yourhandle",
  ctaText: "Follow for more",
  variables: {},
};

export function normalizeBrandKit(input?: Partial<BrandKit> | null): BrandKit {
  return {
    ...DEFAULT_BRAND_KIT,
    ...(input ?? {}),
    colors: { ...DEFAULT_BRAND_KIT.colors, ...(input?.colors ?? {}) },
    typography: { ...DEFAULT_BRAND_KIT.typography, ...(input?.typography ?? {}) },
    variables: { ...(input?.variables ?? {}) },
  };
}

/** Values are flattened intentionally so the existing {{a.b}} template syntax works. */
export function brandVariables(input?: Partial<BrandKit> | null): Record<string, string> {
  const brand = normalizeBrandKit(input);
  return {
    "brand.name": brand.name,
    "brand.primaryColor": brand.colors.primary,
    "brand.secondaryColor": brand.colors.secondary,
    "brand.accentColor": brand.colors.accent,
    "brand.backgroundColor": brand.colors.background,
    "brand.textColor": brand.colors.text,
    "brand.headingFont": brand.typography.headingFont,
    "brand.bodyFont": brand.typography.bodyFont,
    "brand.logo": brand.logoSrc ?? "",
    "brand.watermark": brand.watermarkSrc ?? "",
    "brand.handle": brand.socialHandle ?? "",
    "brand.cta": brand.ctaText ?? "",
    ...Object.fromEntries(Object.entries(brand.variables ?? {}).map(([key, value]) => [`brand.${key}`, String(value)])),
  };
}

export function mergeBrandVariables(doc: EditorDocument, vars: Record<string, string> = {}): Record<string, string> {
  if (doc.version !== 2) return vars;
  // Campaign/user values win, so automation can override a brand default explicitly.
  return { ...brandVariables(doc.brand), ...vars };
}

export function cloneElementForComponent(el: EditorElement, idFactory: (prefix?: string) => string): EditorElement {
  return {
    ...structuredClone(el),
    id: idFactory(el.type),
    keyframes: el.keyframes?.map((kf) => ({ ...kf, id: idFactory("kf"), values: { ...kf.values } })),
  } as EditorElement;
}

export function componentFromElements(
  name: string,
  elements: EditorElement[],
  idFactory: (prefix?: string) => string,
): EditorReusableComponent {
  if (!elements.length) throw new Error("A reusable component needs at least one element");
  const minX = Math.min(...elements.map((el) => el.x));
  const minY = Math.min(...elements.map((el) => el.y));
  const maxX = Math.max(...elements.map((el) => el.x + el.w));
  const maxY = Math.max(...elements.map((el) => el.y + el.h));
  const snapshots = elements.map((el) => ({ ...structuredClone(el), x: el.x - minX, y: el.y - minY } as EditorElement));
  return {
    id: idFactory("component"),
    name: name.trim() || "Reusable component",
    createdAt: Date.now(),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    elements: snapshots,
  };
}

export function instantiateComponent(
  component: EditorReusableComponent,
  x: number,
  y: number,
  idFactory: (prefix?: string) => string,
): EditorElement[] {
  return component.elements.map((source) => {
    const cloned = cloneElementForComponent(source, idFactory);
    return { ...cloned, x: x + source.x, y: y + source.y } as EditorElement;
  });
}

function baseText(id: string, text: string, x: number, y: number, w: number, h: number): TextElement {
  return {
    id, type: "text", text, x, y, w, h, rotation: 0, opacity: 1,
    fontFamily: "{{brand.headingFont}}", fontSize: 56, fontWeight: 800,
    color: "{{brand.textColor}}", align: "center", autoFit: true, minFontSize: 26,
    maxLines: 2, lineHeight: 1.05, vAlign: "middle", startMs: 0, durationMs: 5000,
  };
}

export function builtInBrandComponents(idFactory: (prefix?: string) => string): EditorReusableComponent[] {
  const make = (name: string, width: number, height: number, elements: EditorElement[]): EditorReusableComponent => ({
    id: `builtin_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    name, width, height, createdAt: 0, builtIn: true, elements,
  });

  return [
    make("Brand CTA", 720, 150, [
      { id: "cta_bg", type: "shape", shape: "rect", x: 0, y: 0, w: 720, h: 150, rotation: 0, opacity: 1, fill: "{{brand.primaryColor}}", radius: 44, startMs: 0, durationMs: 5000, animations: { in: { type: "pop", durationMs: 420, easing: "spring" } } },
      { ...baseText("cta_text", "{{brand.cta}}", 30, 20, 660, 110), fontSize: 52, animations: { in: { type: "fade", delayMs: 120, durationMs: 320 } } },
    ]),
    make("Social Handle", 620, 110, [
      { id: "handle_bg", type: "shape", shape: "rect", x: 0, y: 0, w: 620, h: 110, rotation: 0, opacity: .88, fill: "{{brand.backgroundColor}}", radius: 32, stroke: "{{brand.primaryColor}}", strokeWidth: 3, startMs: 0, durationMs: 5000 },
      { ...baseText("handle_text", "{{brand.handle}}", 24, 12, 572, 86), fontFamily: "{{brand.bodyFont}}", fontSize: 42, fontWeight: 700 },
    ]),
    make("Logo Lockup", 480, 180, [
      { id: "logo_image", type: "image", src: "{{brand.logo}}", fit: "contain", x: 0, y: 0, w: 180, h: 180, rotation: 0, opacity: 1, startMs: 0, durationMs: 5000, animations: { in: { type: "scale", durationMs: 450, easing: "spring" } } },
      { ...baseText("logo_name", "{{brand.name}}", 195, 25, 285, 130), fontSize: 46, align: "left" },
    ]),
    make("Watermark", 220, 100, [
      { id: "watermark_image", type: "image", src: "{{brand.watermark}}", fit: "contain", x: 0, y: 0, w: 220, h: 100, rotation: 0, opacity: .5, startMs: 0, durationMs: 5000 },
    ]),
  ].map((component) => ({
    ...component,
    elements: component.elements.map((el) => cloneElementForComponent(el, idFactory)),
  }));
}

function resolveToken(value: string | undefined, vars: Record<string, string>): string | undefined {
  if (value == null) return value;
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/** Resolve both explicit {{brand.*}} tokens and property bindings into render-ready element values. */
export function resolveElementVariables(el: EditorElement, vars: Record<string, string>): EditorElement {
  const bindings = el.brandBindings ?? {};
  const bound = (property: string, fallback?: string) => {
    const key = bindings[property as keyof typeof bindings];
    return key ? (vars[key] ?? fallback) : fallback;
  };
  if (el.type === "text") {
    return {
      ...el,
      text: resolveToken(el.text, vars) ?? el.text,
      color: resolveToken(bound("color", el.color), vars) ?? el.color,
      background: resolveToken(bound("background", el.background), vars),
      fontFamily: resolveToken(bound("fontFamily", el.fontFamily), vars) ?? el.fontFamily,
      stroke: resolveToken(bound("stroke", el.stroke), vars),
    };
  }
  if (el.type === "shape") {
    return {
      ...el,
      fill: resolveToken(bound("fill", el.fill), vars) ?? el.fill,
      stroke: resolveToken(bound("stroke", el.stroke), vars),
    };
  }
  if (el.type === "image" || el.type === "video") {
    return { ...el, src: resolveToken(bound("src", el.src), vars) ?? el.src };
  }
  return el;
}

const BRAND_LIBRARY_KEY = "shortsforge.brand-kits.v1";
const COMPONENT_LIBRARY_KEY = "shortsforge.components.v1";

function readLocalLibrary<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch { return []; }
}
function writeLocalLibrary<T>(key: string, items: T[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage may be unavailable */ }
}

export const loadBrandLibrary = () => readLocalLibrary<BrandKit>(BRAND_LIBRARY_KEY).map(normalizeBrandKit);
export const saveBrandLibrary = (items: BrandKit[]) => writeLocalLibrary(BRAND_LIBRARY_KEY, items);
export const loadComponentLibrary = () => readLocalLibrary<EditorReusableComponent>(COMPONENT_LIBRARY_KEY);
export const saveComponentLibrary = (items: EditorReusableComponent[]) => writeLocalLibrary(COMPONENT_LIBRARY_KEY, items);
