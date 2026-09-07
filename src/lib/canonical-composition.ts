import { z } from "zod";
import { migrateDocumentV1ToV2, syncV2Timeline } from "@/lib/editor-document-v2";
import { parseEditorDocument } from "@/lib/editor-document-schema";
import type { EditorDocument, EditorDocumentV2 } from "@/lib/types";

export const CANONICAL_COMPOSITION_SCHEMA = "shorts-mation/composition" as const;
export const CANONICAL_COMPOSITION_VERSION = 1 as const;

const canonicalEnvelopeSchema = z.object({
  schema: z.literal(CANONICAL_COMPOSITION_SCHEMA),
  version: z.literal(CANONICAL_COMPOSITION_VERSION),
  compositionId: z.string().min(1),
  document: z.unknown(),
  createdAt: z.string().datetime(),
}).strict();

export type CanonicalComposition = {
  schema: typeof CANONICAL_COMPOSITION_SCHEMA;
  version: typeof CANONICAL_COMPOSITION_VERSION;
  compositionId: string;
  document: EditorDocumentV2;
  createdAt: string;
};

export type CanonicalCompositionIssue = {
  path: string;
  message: string;
};

function collectDuplicateIds(doc: EditorDocumentV2): CanonicalCompositionIssue[] {
  const issues: CanonicalCompositionIssue[] = [];
  const seen = new Map<string, string>();
  const register = (id: string, path: string) => {
    const previous = seen.get(id);
    if (previous) issues.push({ path, message: `Duplicate id '${id}' also used at ${previous}` });
    else seen.set(id, path);
  };

  doc.scenes.forEach((scene, sceneIndex) => {
    register(scene.id, `document.scenes.${sceneIndex}.id`);
    scene.elements.forEach((element, elementIndex) => register(element.id, `document.scenes.${sceneIndex}.elements.${elementIndex}.id`));
  });
  doc.audioClips.forEach((clip, index) => register(clip.id, `document.audioClips.${index}.id`));
  doc.captionClips.forEach((clip, index) => register(clip.id, `document.captionClips.${index}.id`));
  doc.effectClips.forEach((clip, index) => register(clip.id, `document.effectClips.${index}.id`));
  return issues;
}

function validateTimelineBounds(doc: EditorDocumentV2): CanonicalCompositionIssue[] {
  const issues: CanonicalCompositionIssue[] = [];
  const total = doc.durationMs;
  const check = (startMs: number, durationMs: number, path: string) => {
    if (startMs < 0) issues.push({ path: `${path}.startMs`, message: "startMs must be >= 0" });
    if (durationMs <= 0) issues.push({ path: `${path}.durationMs`, message: "durationMs must be > 0" });
    if (startMs + durationMs > total + 1) issues.push({ path, message: `Clip ends after composition duration (${total}ms)` });
  };
  doc.audioClips.forEach((clip, index) => check(clip.startMs, clip.durationMs, `document.audioClips.${index}`));
  doc.captionClips.forEach((clip, index) => check(clip.startMs, clip.durationMs, `document.captionClips.${index}`));
  doc.effectClips.forEach((clip, index) => check(clip.startMs, clip.durationMs, `document.effectClips.${index}`));
  doc.tracks.forEach((track, trackIndex) => track.clips.forEach((clip, clipIndex) => check(clip.startMs, clip.durationMs, `document.tracks.${trackIndex}.clips.${clipIndex}`)));
  return issues;
}

function validatePersistedMediaRefs(doc: EditorDocumentV2): CanonicalCompositionIssue[] {
  const issues: CanonicalCompositionIssue[] = [];
  const check = (src: string | undefined, path: string) => {
    if (!src) return;
    if (src.startsWith("blob:")) issues.push({ path, message: "blob: URLs are browser-session-only and cannot be part of a canonical composition" });
  };
  doc.scenes.forEach((scene, sceneIndex) => scene.elements.forEach((element, elementIndex) => {
    if (element.type === "image" || element.type === "video") check(element.src, `document.scenes.${sceneIndex}.elements.${elementIndex}.src`);
  }));
  doc.audioClips.forEach((clip, index) => check(clip.src, `document.audioClips.${index}.src`));
  check(doc.audio?.src, "document.audio.src");
  return issues;
}

export function canonicalCompositionIssues(doc: EditorDocumentV2): CanonicalCompositionIssue[] {
  return [
    ...collectDuplicateIds(doc),
    ...validateTimelineBounds(doc),
    ...validatePersistedMediaRefs(doc),
  ];
}

/**
 * The Phase 0 boundary between editor/templates/automation and all future renderers.
 * Every consumer must receive this normalized envelope instead of interpreting
 * editor state independently.
 */
export function createCanonicalComposition(
  input: EditorDocument | unknown,
  options?: { compositionId?: string; createdAt?: string },
): CanonicalComposition {
  const parsed = parseEditorDocument(input);
  const v2 = parsed.version === 2 ? syncV2Timeline(parsed) : migrateDocumentV1ToV2(parsed);
  const issues = canonicalCompositionIssues(v2);
  if (issues.length) {
    const first = issues[0]!;
    throw new Error(`Invalid canonical composition at ${first.path}: ${first.message}`);
  }
  return {
    schema: CANONICAL_COMPOSITION_SCHEMA,
    version: CANONICAL_COMPOSITION_VERSION,
    compositionId: options?.compositionId ?? crypto.randomUUID(),
    document: v2,
    createdAt: options?.createdAt ?? new Date().toISOString(),
  };
}

export function parseCanonicalComposition(input: unknown): CanonicalComposition {
  const envelope = canonicalEnvelopeSchema.parse(input);
  const parsedDocument = parseEditorDocument(envelope.document);
  if (parsedDocument.version !== 2) throw new Error("Canonical composition document must be editor document V2");
  const document = syncV2Timeline(parsedDocument);
  const issues = canonicalCompositionIssues(document);
  if (issues.length) {
    const first = issues[0]!;
    throw new Error(`Invalid canonical composition at ${first.path}: ${first.message}`);
  }
  return { ...envelope, document } as CanonicalComposition;
}
