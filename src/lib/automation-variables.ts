import { mergeBrandVariables, resolveElementVariables } from "@/lib/brand-components";
import { effectiveSceneDurationMs } from "@/lib/timeline-duration";
import type {
  AutomationVariableDefinition,
  AutomationVariableType,
  EditorDocument,
  EditorDocumentV2,
  EditorElement,
  EditorScene,
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
      const scene = repeatVar ? cloneSceneForRepeat(source, `${repeatVar}_${index}`) : structuredClone(source);
      scene.name = replaceTokens(scene.name, renderValues);
      scene.background = replaceTokens(scene.background, renderValues);
      scene.visibleWhen = undefined;
      scene.elements = scene.elements
        .filter((el) => evaluateVisibility(el.visibleWhen, localUnknown))
        .map((el) => ({ ...resolveElementVariables(el, renderValues), visibleWhen: undefined } as EditorElement));
      scenes.push(scene);
    });
  }
  const values = Object.fromEntries(Object.entries(valuesUnknown).map(([k, v]) => [k, stringifyRenderValue(v)]));
  const document = { ...inputDoc, scenes } as EditorDocument;
  if (document.version === 2) {
    const v2 = document as EditorDocumentV2;
    // Project audio can also use typed {{audioVariable}} sources.
    v2.audioClips = (v2.audioClips ?? []).map((clip) => ({ ...clip, src: replaceTokens(clip.src, values) }));
    v2.captionClips = (v2.captionClips ?? []).map((clip) => ({ ...clip, words: clip.words.map((word) => ({ ...word, text: replaceTokens(word.text, values) })) }));
    // Tracks are editor metadata; concrete scene/element timings remain authoritative.
    v2.durationMs = scenes.reduce((sum, s) => sum + Math.max(250, effectiveSceneDurationMs(s)), 0);
  }
  return { document, values, errors: checked.errors };
}

function replaceTokens(value: string, vars: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
