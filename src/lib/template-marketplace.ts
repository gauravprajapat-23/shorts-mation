import type { EditorDocument, EditorDocumentV2 } from "@/lib/types";
import { migrateDocumentV1ToV2 } from "@/lib/editor-document-v2";
import { extractVariables } from "@/lib/editor-defaults";

export const TEMPLATE_CATEGORIES = [
  "Education","Quiz & Trivia","Gaming","Motivation","Facts","Kids","Business",
  "Product","News","Spiritual","Entertainment","Social","Other",
] as const;

export type TemplateValidation = {
  score: number;
  requiredVariables: string[];
  allVariables: string[];
  issues: string[];
  strengths: string[];
};

function unique(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function requiredTemplateVariables(doc: EditorDocument): string[] {
  const v2 = migrateDocumentV1ToV2(doc);
  const typed = (v2.automationVariables ?? []).filter((v) => v.required).map((v) => v.name);
  const discovered = extractVariables(v2).filter((name) => {
    const definition = v2.automationVariables?.find((v) => v.name === name);
    return definition?.required === true;
  });
  return unique([...typed, ...discovered]);
}

export function validateTemplateProduct(doc: EditorDocument, input?: {
  name?: string;
  description?: string | null;
  documentation?: string | null;
  thumbnailUrl?: string | null;
  previewVideoUrl?: string | null;
  tags?: string[];
}): TemplateValidation {
  const v2: EditorDocumentV2 = migrateDocumentV1ToV2(doc);
  const issues: string[] = [];
  const strengths: string[] = [];
  const allVariables = unique(extractVariables(v2));
  const requiredVariables = requiredTemplateVariables(v2);
  let score = 100;

  if (!v2.scenes.length) { issues.push("Template has no scenes."); score -= 45; }
  if (v2.durationMs <= 0) { issues.push("Template duration is invalid."); score -= 20; }
  if (!allVariables.length) { issues.push("No automation variables detected."); score -= 10; }
  else strengths.push(`${allVariables.length} automation variable${allVariables.length === 1 ? "" : "s"} detected.`);
  if (!requiredVariables.length && allVariables.length) { issues.push("No variables are marked required."); score -= 5; }
  else if (requiredVariables.length) strengths.push(`${requiredVariables.length} required variable${requiredVariables.length === 1 ? "" : "s"} defined.`);

  const emptyScenes = v2.scenes.filter((s) => !s.elements.length);
  if (emptyScenes.length) { issues.push(`${emptyScenes.length} empty scene${emptyScenes.length === 1 ? "" : "s"}.`); score -= Math.min(15, emptyScenes.length * 3); }
  if (!(input?.name ?? "").trim()) { issues.push("Template name is missing."); score -= 10; }
  if (!(input?.description ?? "").trim()) { issues.push("Marketplace description is missing."); score -= 5; }
  else strengths.push("Marketplace description provided.");
  if (!(input?.documentation ?? "").trim()) { issues.push("Template documentation is missing."); score -= 5; }
  else strengths.push("Documentation provided.");
  if (!(input?.thumbnailUrl ?? "").trim()) { issues.push("Thumbnail is missing."); score -= 5; }
  else strengths.push("Thumbnail configured.");
  if (!(input?.previewVideoUrl ?? "").trim()) { issues.push("Preview video is missing."); score -= 5; }
  else strengths.push("Preview video configured.");
  if (!(input?.tags?.length)) { issues.push("Add searchable tags."); score -= 5; }

  return { score: Math.max(0, Math.min(100, score)), requiredVariables, allVariables, issues, strengths };
}

export function generateTemplateDocumentation(doc: EditorDocument, templateName: string): string {
  const v2 = migrateDocumentV1ToV2(doc);
  const vars = unique(extractVariables(v2));
  const defs = v2.automationVariables ?? [];
  const lines = [
    `# ${templateName}`,
    "",
    `Aspect ratio: ${v2.aspect}`,
    `Scenes: ${v2.scenes.length}`,
    `Duration: ${(v2.durationMs / 1000).toFixed(1)} seconds`,
    "",
    "## Variables",
  ];
  if (!vars.length) lines.push("This template has no automation variables.");
  for (const name of vars) {
    const def = defs.find((v) => v.name === name);
    const details = [
      def?.type ?? "text",
      def?.required ? "required" : "optional",
      def?.description?.trim(),
    ].filter(Boolean).join(" · ");
    lines.push(`- ${name}${details ? ` — ${details}` : ""}`);
  }
  lines.push("", "## Usage", "Import or generate campaign data with columns matching the variables above, preview the result, then render or schedule the campaign.");
  return lines.join("\n");
}

export function normalizeTemplateTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(",");
  return unique(parts.map((v) => v.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim())).slice(0, 12);
}
