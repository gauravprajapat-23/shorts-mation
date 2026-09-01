import { migrateDocumentV1ToV2 } from "@/lib/editor-document-v2";
import { parseEditorDocument } from "@/lib/editor-document-schema";
import type { EditorDocument, EditorDocumentV2 } from "@/lib/types";

export const PORTABLE_TEMPLATE_FORMAT = "shorts-mation-template" as const;
export const PORTABLE_TEMPLATE_VERSION = 1 as const;
export const MAX_TEMPLATE_FILE_BYTES = 10 * 1024 * 1024;

export type PortableTemplateFileV1 = {
  format: typeof PORTABLE_TEMPLATE_FORMAT;
  formatVersion: typeof PORTABLE_TEMPLATE_VERSION;
  name: string;
  type: string;
  aspect: "9:16" | "16:9" | "1:1";
  exportedAt: string;
  document: EditorDocumentV2;
};

export type ImportedTemplate = {
  name: string;
  type: string;
  document: EditorDocumentV2;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanName(value: unknown, fallback = "Imported template") {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || fallback).slice(0, 120);
}

function cleanType(value: unknown, fallback = "custom") {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (type || fallback).replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || fallback;
}

function normalizeDocument(input: unknown): EditorDocumentV2 {
  const parsed = parseEditorDocument(input);
  const document = migrateDocumentV1ToV2(parsed);
  if (document.scenes.length > 250) throw new Error("Template has too many scenes (maximum 250)");
  const elementCount = document.scenes.reduce((sum, scene) => sum + scene.elements.length, 0);
  if (elementCount > 5000) throw new Error("Template has too many elements (maximum 5000)");
  return document;
}

export function createPortableTemplate(input: { name: string; type?: string; document: EditorDocument }): PortableTemplateFileV1 {
  const document = normalizeDocument(input.document);
  return {
    format: PORTABLE_TEMPLATE_FORMAT,
    formatVersion: PORTABLE_TEMPLATE_VERSION,
    name: cleanName(input.name, "Untitled template"),
    type: cleanType(input.type, "custom"),
    aspect: document.aspect,
    exportedAt: new Date().toISOString(),
    document,
  };
}

/**
 * Accepts the official portable envelope, a raw EditorDocument, or a database
 * row-like object containing template_json. Every path is runtime-validated
 * and migrated to canonical Editor V2 before it can be persisted.
 */
export function parseTemplateImport(input: unknown, fileName?: string): ImportedTemplate {
  const obj = asRecord(input);
  const fallbackName = cleanName(fileName?.replace(/\.(shorts-template\.)?json$/i, ""), "Imported template");

  if (obj?.format === PORTABLE_TEMPLATE_FORMAT) {
    if (obj.formatVersion !== PORTABLE_TEMPLATE_VERSION) {
      throw new Error(`Unsupported template format version: ${String(obj.formatVersion ?? "unknown")}`);
    }
    const document = normalizeDocument(obj.document);
    return { name: cleanName(obj.name, fallbackName), type: cleanType(obj.type), document };
  }

  if (obj && "template_json" in obj) {
    const document = normalizeDocument(obj.template_json);
    return { name: cleanName(obj.name, fallbackName), type: cleanType(obj.type), document };
  }

  const document = normalizeDocument(input);
  return { name: fallbackName, type: "custom", document };
}

export function serializePortableTemplate(input: { name: string; type?: string; document: EditorDocument }): string {
  return `${JSON.stringify(createPortableTemplate(input), null, 2)}\n`;
}

export function templateFileName(name: string): string {
  const slug = cleanName(name, "template").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "template";
  return `${slug}.shorts-template.json`;
}

export function downloadPortableTemplate(input: { name: string; type?: string; document: EditorDocument }) {
  const blob = new Blob([serializePortableTemplate(input)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = templateFileName(input.name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readTemplateFile(file: File): Promise<ImportedTemplate> {
  if (file.size > MAX_TEMPLATE_FILE_BYTES) throw new Error("Template file is larger than 10 MB");
  if (!/\.json$/i.test(file.name)) throw new Error("Choose a .json template file");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Template file is not valid JSON");
  }
  return parseTemplateImport(parsed, file.name);
}
