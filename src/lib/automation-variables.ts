import { mergeBrandVariables, resolveElementVariables } from "@/lib/brand-components";
import { effectiveSceneDurationMs } from "@/lib/timeline-duration";
import type {
  AutomationVariableDefinition,
  AutomationVariableType,
  EditorDocument,
  EditorDocumentV2,
  EditorAudioClip,
  EditorElement,
  EditorScene,
  TextElement,
  VisibilityCondition,
} from "@/lib/types";

export type AutomationInput = Record<string, unknown>;
export type AutomationValidationError = { variable: string; message: string };

const uid = (base: string, suffix: string) => `${base}__${suffix.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export function inferAutomationType(name: string): AutomationVariableType {
  const n = name.toLowerCase();
  if (/(image|photo|logo|thumbnail|avatar)/.test(n)) return "image";
  if (/(video|broll|background_video)/.test(n)) return "video";
  if (/(audio|music|voice|sfx)/.test(n)) return "audio";
  if (/(color|colour)/.test(n)) return "color";
  return "text";
}

export function automationDefinitions(doc: EditorDocument): AutomationVariableDefinition[] {
  if (doc.version === 2 && doc.automationVariables?.length) return doc.automationVariables;
  return doc.variables.map((name) => ({ id: `var_${name}`, name, label: name, type: inferAutomationType(name) }));
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed; } catch { /* allow CSV/newline */ }
    return text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [value];
}

function coerce(def: AutomationVariableDefinition, input: unknown): unknown {
  const value = input == null || input === "" ? def.defaultValue : input;
  if (def.type === "array") return parseArray(value);
  if (def.type === "boolean") return parseBoolean(value);
  if (def.type === "number") return value == null || value === "" ? "" : Number(value);
  return value == null ? "" : String(value);
}

export function validateAutomationInputs(doc: EditorDocument, input: AutomationInput): { values: AutomationInput; errors: AutomationValidationError[] } {
  const values: AutomationInput = { ...input };
  const errors: AutomationValidationError[] = [];
  for (const def of automationDefinitions(doc)) {
    const value = coerce(def, input[def.name]);
    values[def.name] = value;
    const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    if (def.required && empty) errors.push({ variable: def.name, message: `${def.label || def.name} is required` });
    if (empty) continue;
    if (typeof value === "string") {
      if (def.validation?.minLength != null && value.length < def.validation.minLength) errors.push({ variable: def.name, message: `Minimum ${def.validation.minLength} characters` });
      if (def.validation?.maxLength != null && value.length > def.validation.maxLength) errors.push({ variable: def.name, message: `Maximum ${def.validation.maxLength} characters` });
      if (def.validation?.pattern) { try { if (!new RegExp(def.validation.pattern).test(value)) errors.push({ variable: def.name, message: "Value does not match the required format" }); } catch { errors.push({ variable: def.name, message: "Invalid validation pattern" }); } }
      if (def.type === "color" && !/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i.test(value)) errors.push({ variable: def.name, message: "Enter a valid CSS color" });
    }
    if (def.type === "number" && typeof value === "number") {
      if (!Number.isFinite(value)) errors.push({ variable: def.name, message: "Enter a valid number" });
      if (def.validation?.min != null && value < def.validation.min) errors.push({ variable: def.name, message: `Minimum value is ${def.validation.min}` });
      if (def.validation?.max != null && value > def.validation.max) errors.push({ variable: def.name, message: `Maximum value is ${def.validation.max}` });
    }
  }
  return { values, errors };
}

function readPath(values: AutomationInput, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(values, path)) return values[path];
  const parts = path.split(".");
  let current: unknown = values;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateVisibility(condition: VisibilityCondition | undefined, values: AutomationInput): boolean {
  if (!condition?.variable) return true;
  const raw = readPath(values, condition.variable);
  const text = raw == null ? "" : String(raw);
  switch (condition.operator) {
    case "exists": return raw !== undefined && raw !== null;
    case "notEmpty": return Array.isArray(raw) ? raw.length > 0 : text.trim().length > 0;
    case "equals": return text === String(condition.value ?? "");
    case "notEquals": return text !== String(condition.value ?? "");
    case "contains": return Array.isArray(raw) ? raw.map(String).includes(String(condition.value ?? "")) : text.includes(String(condition.value ?? ""));
    case "truthy": return parseBoolean(raw);
    case "falsy": return !parseBoolean(raw);
    default: return true;
  }
}

function stringifyRenderValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function flattenItem(alias: string, item: unknown, indexAlias: string, index: number): AutomationInput {
  const out: AutomationInput = { [alias]: item, [indexAlias]: index + 1 };
  if (item && typeof item === "object" && !Array.isArray(item)) {
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) out[`${alias}.${key}`] = value;
  }
  return out;
}

function cloneSceneForRepeat(scene: EditorScene, suffix: string): EditorScene {
  return {
    ...structuredClone(scene),
    id: uid(scene.id, suffix),
    name: scene.name,
    repeat: undefined,
    elements: scene.elements.map((el) => ({ ...structuredClone(el), id: uid(el.id, suffix), keyframes: el.keyframes?.map((kf) => ({ ...kf, id: uid(kf.id, suffix) })) } as EditorElement)),
  };
}



type GeneratedSceneResult = { scene: EditorScene; audio: Array<Omit<EditorAudioClip, "startMs"> & { startMs: number }> };

const HALF_LETTER_COLORS = ["#FF2F92", "#FF9F1C", "#8B5CF6", "#2E90FA", "#22C55E", "#F97316", "#06B6D4", "#EAB308", "#EC4899", "#14B8A6"];

function normalizeHalfLetterWord(value: unknown, maxCharacters = 10): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, Math.max(1, Math.min(16, maxCharacters)));
}

function halfLetterText(
  id: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  clipInsetPct: TextElement["clipInsetPct"],
  fontSize: number,
): TextElement {
  return {
    id, type: "text", text, x, y, w, h, rotation: 0, opacity: 1,
    fontFamily: "Arial Black", fontSize, fontWeight: 900, color, align: "center",
    textTransform: "uppercase", autoFit: true, maxLines: 1, clipInsetPct,
    stroke: "#FF2F92", strokeWidth: 3,
  };
}

function generateHalfLetterWordScene(source: EditorScene, values: AutomationInput): GeneratedSceneResult {
  const layout = source.dynamicLayout;
  if (!layout || layout.type !== "halfLetterWord") return { scene: source, audio: [] };
  const word = normalizeHalfLetterWord(readPath(values, layout.wordVariable), layout.maxCharacters ?? 10) || "HOUSE";
  const chars = [...word];
  const count = chars.length;
  const top = 260;
  const bottom = 1660;
  const available = bottom - top;
  const rowGap = count <= 5 ? 22 : 12;
  const rowH = Math.max(112, Math.min(250, Math.floor((available - rowGap * Math.max(0, count - 1)) / Math.max(1, count))));
  const letterH = Math.max(104, rowH);
  const letterW = Math.max(210, Math.min(360, Math.round(letterH * 1.35)));
  const x = Math.round((1080 - letterW) / 2);
  const fontSize = Math.round(letterH * 0.9);
  const yFor = (index: number) => top + index * (rowH + rowGap);
  const attemptMs = count <= 5 ? 1450 : count <= 7 ? 1050 : 760;
  const travelMs = Math.round(attemptMs * 0.68);
  const holdMs = attemptMs - travelMs;
  const betweenLettersMs = count <= 5 ? 360 : 220;
  let cursor = 450;
  const generated: EditorElement[] = [];
  const audio: GeneratedSceneResult["audio"] = [];
  const completedHalves: TextElement[] = [];
  const unmatched = new Set(chars.map((_, index) => index));

  chars.forEach((char, index) => {
    const color = HALF_LETTER_COLORS[index % HALF_LETTER_COLORS.length]!;
    generated.push(halfLetterText(`hlw-fixed-${index}`, char, x, yFor(index), letterW, letterH, color, { right: 50 }, fontSize));
  });

  for (let sourceIndex = count - 1; sourceIndex >= 0; sourceIndex--) {
    const movingChar = chars[sourceIndex]!;
    const movingColor = HALF_LETTER_COLORS[sourceIndex % HALF_LETTER_COLORS.length]!;
    const candidateIndices = [...unmatched].sort((a, b) => a - b);
    const targetIndex = candidateIndices.find((index) => chars[index] === movingChar);
    if (targetIndex == null) continue;
    const movingStart = cursor;
    let local = 0;
    const keyframes: NonNullable<TextElement["keyframes"]> = [
      { id: `hlw-move-${sourceIndex}-start`, timeMs: 0, easing: "linear", values: { x, y: -letterH - 80 } },
    ];
    let matchAt = movingStart;

    for (const candidate of candidateIndices) {
      local += travelMs;
      keyframes.push({ id: `hlw-move-${sourceIndex}-${candidate}-land`, timeMs: local, easing: "bounce", values: { x, y: yFor(candidate) } });
      const isCorrect = candidate === targetIndex;
      const markerStart = movingStart + local - 40;
      generated.push({
        id: `hlw-${isCorrect ? "correct" : "wrong"}-${sourceIndex}-${candidate}`,
        type: "text", text: isCorrect ? "✓" : "✕", x: x + letterW - 18, y: yFor(candidate) - 12, w: 150, h: 150, rotation: 0, opacity: 1,
        startMs: markerStart, durationMs: isCorrect ? 820 : Math.max(420, holdMs + 120),
        fontFamily: "Arial", fontSize: 126, fontWeight: 900, color: isCorrect ? "#16A34A" : "#EF4444", align: "center",
        animations: { in: { type: "pop", durationMs: 180, easing: "spring" }, ...(isCorrect ? {} : { out: { type: "fade", startMs: Math.max(260, holdMs - 80), durationMs: 160 } }) },
      });
      audio.push({
        id: `hlw-sfx-${isCorrect ? "correct" : "wrong"}-${sourceIndex}-${candidate}`,
        name: isCorrect ? "Correct match" : "Wrong match",
        src: isCorrect ? (layout.correctSfx || "/sounds/letter-match-correct.wav") : (layout.wrongSfx || "/sounds/letter-match-wrong.wav"),
        role: "sfx", durationMs: isCorrect ? 190 : 210, sourceStartMs: 0, sourceEndMs: isCorrect ? 190 : 210, volume: 1,
        startMs: markerStart + 40,
      });
      local += holdMs;
      if (isCorrect) { matchAt = movingStart + local; break; }
    }

    const moving = halfLetterText(`hlw-moving-${sourceIndex}`, movingChar, x, -letterH - 80, letterW, letterH, movingColor, { left: 50 }, fontSize);
    moving.startMs = movingStart;
    moving.durationMs = Math.max(250, local);
    moving.keyframes = keyframes;
    generated.push(moving);

    const completed = halfLetterText(`hlw-complete-half-${targetIndex}`, movingChar, x, yFor(targetIndex), letterW, letterH, movingColor, { left: 50 }, fontSize);
    completed.startMs = matchAt;
    completed.durationMs = 250;
    completedHalves.push(completed);
    generated.push(completed);
    unmatched.delete(targetIndex);
    cursor = matchAt + betweenLettersMs;
  }

  const endHold = 1700;
  const durationMs = Math.max(4200, cursor + endHold);
  completedHalves.forEach((element) => { element.durationMs = Math.max(250, durationMs - (element.startMs ?? 0)); });
  generated.push({
    id: "hlw-complete-label", type: "text", text: `${word} COMPLETE!`, x: 120, y: 1720, w: 840, h: 120, rotation: 0, opacity: 1,
    startMs: Math.max(0, cursor - 120), durationMs: endHold, fontFamily: "Plus Jakarta Sans", fontSize: 62, fontWeight: 900,
    color: "#FFFFFF", align: "center", textTransform: "uppercase", autoFit: true, maxLines: 1, stroke: "#0F172A", strokeWidth: 3,
    animations: { in: { type: "pop", durationMs: 360, easing: "spring" }, loop: { type: "pulse", amplitude: 1, speedMs: 900 } },
  });

  return {
    scene: { ...source, durationMs, dynamicLayout: undefined, elements: [...source.elements.map((el) => ({ ...el, durationMs: Math.max(250, durationMs - (el.startMs ?? 0)) } as EditorElement)), ...generated] },
    audio,
  };
}

/**
 * Turns typed automation input into the concrete document consumed by preview and renderers.
 * Repeated/conditional scenes are resolved here so downstream timing code remains simple.
 */
export function materializeAutomationDocument(inputDoc: EditorDocument, rawInput: AutomationInput = {}): {
  document: EditorDocument;
  values: Record<string, string>;
  errors: AutomationValidationError[];
} {
  const checked = validateAutomationInputs(inputDoc, rawInput);
  const brandStrings = inputDoc.version === 2 ? mergeBrandVariables(inputDoc, {}) : {};
  const valuesUnknown: AutomationInput = { ...brandStrings, ...checked.values };
  const scenes: EditorScene[] = [];
  const generatedAudio: EditorAudioClip[] = [];
  let sceneCursorMs = 0;
  for (const source of inputDoc.scenes) {
    if (!evaluateVisibility(source.visibleWhen, valuesUnknown)) continue;
    const repeatVar = source.repeat?.variable;
    const items = repeatVar ? parseArray(readPath(valuesUnknown, repeatVar)) : [undefined];
    const maxItems = Math.max(0, Math.min(500, source.repeat?.maxItems ?? 100));
    const list = repeatVar ? items.slice(0, maxItems) : items;
    list.forEach((item, index) => {
      const alias = source.repeat?.itemAlias || "item";
      const indexAlias = source.repeat?.indexAlias || "index";
      const localUnknown = repeatVar ? { ...valuesUnknown, ...flattenItem(alias, item, indexAlias, index) } : valuesUnknown;
      const renderValues = Object.fromEntries(Object.entries(localUnknown).map(([k, v]) => [k, stringifyRenderValue(v)]));
      let scene = repeatVar ? cloneSceneForRepeat(source, `${repeatVar}_${index}`) : structuredClone(source);
      scene.name = replaceTokens(scene.name, renderValues);
      scene.background = replaceTokens(scene.background, renderValues);
      scene.visibleWhen = undefined;
      scene.elements = scene.elements
        .filter((el) => evaluateVisibility(el.visibleWhen, localUnknown))
        .map((el) => ({ ...resolveElementVariables(el, renderValues), visibleWhen: undefined } as EditorElement));
      const generated = generateHalfLetterWordScene(scene, localUnknown);
      scene = generated.scene;
      generatedAudio.push(...generated.audio.map((clip) => ({ ...clip, startMs: clip.startMs + sceneCursorMs })));
      scenes.push(scene);
      sceneCursorMs += Math.max(250, effectiveSceneDurationMs(scene));
    });
  }
  const values = Object.fromEntries(Object.entries(valuesUnknown).map(([k, v]) => [k, stringifyRenderValue(v)]));
  const document = { ...inputDoc, scenes } as EditorDocument;
  if (document.version === 2) {
    const v2 = document as EditorDocumentV2;
    // Project audio can also use typed {{audioVariable}} sources.
    v2.audioClips = [...(v2.audioClips ?? []).map((clip) => ({ ...clip, src: replaceTokens(clip.src, values) })), ...generatedAudio];
    v2.captionClips = (v2.captionClips ?? []).map((clip) => ({ ...clip, words: clip.words.map((word) => ({ ...word, text: replaceTokens(word.text, values) })) }));
    // Tracks are editor metadata; concrete scene/element timings remain authoritative.
    v2.durationMs = scenes.reduce((sum, s) => sum + Math.max(250, effectiveSceneDurationMs(s)), 0);
  }
  return { document, values, errors: checked.errors };
}

function replaceTokens(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
