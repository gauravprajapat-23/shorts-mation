import { materializeAutomationDocument } from "@/lib/automation-variables";
import { createCanonicalComposition, type CanonicalComposition } from "@/lib/canonical-composition";
import type { EditorDocument } from "@/lib/types";

export function campaignAutomationInput(content: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries((content ?? {}) as Record<string, unknown>)) {
    if (!key.startsWith("_")) out[key] = value;
  }
  return out;
}

export function campaignStringVariables(content: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(campaignAutomationInput(content)).map(([key, value]) => [
    key,
    value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value),
  ]));
}

/**
 * Phase 1 render boundary. Automation always materializes into the versioned
 * canonical composition envelope before any renderer-specific code can inspect it.
 */
export function materializeCampaignRenderComposition(
  source: EditorDocument,
  content: unknown,
  options?: { compositionId?: string; createdAt?: string },
): {
  composition: CanonicalComposition;
  values: Record<string, string>;
  durationMs: number;
} {
  const concrete = materializeAutomationDocument(source, campaignAutomationInput(content));
  if (concrete.errors.length) {
    throw new Error(`Automation input validation failed: ${concrete.errors.map((e) => `${e.variable}: ${e.message}`).join("; ")}`);
  }
  const composition = createCanonicalComposition(concrete.document, options);
  return { composition, values: concrete.values, durationMs: composition.document.durationMs };
}

/** @deprecated Use materializeCampaignRenderComposition for all renderer-bound work. */
export function materializeCampaignRenderDocument(source: EditorDocument, content: unknown): {
  document: EditorDocument;
  values: Record<string, string>;
  durationMs: number;
} {
  const result = materializeCampaignRenderComposition(source, content);
  return { document: result.composition.document, values: result.values, durationMs: result.durationMs };
}
