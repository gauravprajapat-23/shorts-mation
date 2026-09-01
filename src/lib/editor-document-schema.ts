import { z } from "zod";
import type { EditorDocument } from "@/lib/types";

const finite = z.number().finite();
const nonNegative = finite.min(0);
const positive = finite.gt(0);
const aspect = z.enum(["9:16", "16:9", "1:1"]);

const visibilityCondition = z.object({
  variable: z.string().min(1),
  operator: z.enum(["exists", "notEmpty", "equals", "notEquals", "contains", "truthy", "falsy"]),
  value: z.string().optional(),
}).passthrough();

const elementBase = z.object({
  id: z.string().min(1), x: finite, y: finite, w: positive, h: positive,
  rotation: finite, opacity: finite.min(0).max(1), startMs: nonNegative.optional(),
  durationMs: positive.optional(), visibleWhen: visibilityCondition.optional(),
  keyframes: z.array(z.object({ id: z.string().min(1), timeMs: nonNegative, easing: z.string().optional(), values: z.record(z.string(), finite) }).passthrough()).optional(),
}).passthrough();

const editorElement = z.discriminatedUnion("type", [
  elementBase.extend({
    type: z.literal("text"), text: z.string(), fontFamily: z.string().min(1), fontSize: positive, fontWeight: finite, color: z.string(), align: z.enum(["left", "center", "right"]),
    clipInsetPct: z.object({ top: finite.min(0).max(100).optional(), right: finite.min(0).max(100).optional(), bottom: finite.min(0).max(100).optional(), left: finite.min(0).max(100).optional() }).optional(),
  }),
  elementBase.extend({ type: z.literal("shape"), shape: z.enum(["rect", "ellipse", "triangle", "star", "line"]), fill: z.string() }),
  elementBase.extend({ type: z.literal("image"), src: z.string(), fit: z.enum(["cover", "contain"]) }),
  elementBase.extend({ type: z.literal("video"), src: z.string(), fit: z.enum(["cover", "contain"]) }),
]);

const scene = z.object({
  id: z.string().min(1), name: z.string(), durationMs: positive, background: z.string(),
  elements: z.array(editorElement), visibleWhen: visibilityCondition.optional(),
  repeat: z.object({ variable: z.string().min(1), itemAlias: z.string().optional(), indexAlias: z.string().optional(), maxItems: z.number().int().min(1).max(1000).optional() }).optional(),
}).passthrough();

const v1 = z.object({ version: z.literal(1), aspect, scenes: z.array(scene).min(1), variables: z.array(z.string()) }).passthrough();
const v2 = z.object({
  version: z.literal(2), aspect, width: positive, height: positive, fps: positive.max(120), durationMs: nonNegative,
  scenes: z.array(scene).min(1), tracks: z.array(z.any()), audioClips: z.array(z.any()), captionClips: z.array(z.any()),
  effectClips: z.array(z.any()), audioMix: z.object({ duckingEnabled: z.boolean(), duckLevel: finite.min(0).max(1), attackMs: nonNegative, releaseMs: nonNegative }).passthrough(),
  variables: z.array(z.string()), automationVariables: z.array(z.any()).optional(), components: z.array(z.any()).optional(),
}).passthrough();

export const editorDocumentSchema = z.discriminatedUnion("version", [v1, v2]);

export function parseEditorDocument(input: unknown): EditorDocument {
  const parsed = editorDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid editor document at ${issue?.path.join(".") || "root"}: ${issue?.message || "validation failed"}`);
  }
  return parsed.data as EditorDocument;
}

export function isEditorDocument(input: unknown): input is EditorDocument {
  return editorDocumentSchema.safeParse(input).success;
}
