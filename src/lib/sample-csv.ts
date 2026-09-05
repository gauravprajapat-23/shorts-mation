import type { EditorDocument } from "./types";
import { columnsForTemplate, createTemplateSampleRows, studioRowsToCsv } from "./automation-data-studio";

/**
 * Generate a template-aware sample CSV from the document's actual automation
 * schema. Both argument orders are accepted for backward compatibility with
 * older tests/callers: (doc, name) and (name, doc).
 */
export function generateSampleCsv(doc: EditorDocument, templateName: string): string;
export function generateSampleCsv(templateName: string, doc: EditorDocument): string;
export function generateSampleCsv(a: EditorDocument | string, b: EditorDocument | string): string {
  const doc = typeof a === "string" ? b as EditorDocument : a;
  const templateName = typeof a === "string" ? a : String(b);
  const columns = columnsForTemplate(doc);
  const rows = createTemplateSampleRows(columns, templateName, 6, []);
  return studioRowsToCsv(rows, columns);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const CSV_RESERVED_COLUMNS = [
  "video_file_name", "title", "description", "hook", "cta", "captions",
  "quiz_question", "quiz_answer", "scene_data", "tags", "hashtags",
  "privacy", "schedule_at", "playlist", "category", "background_file_name",
  "audio_file_name",
] as const;
