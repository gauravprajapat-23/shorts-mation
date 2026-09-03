import { materializeAutomationDocument } from "@/lib/automation-variables";
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

export function materializeCampaignRenderDocument(source: EditorDocument, content: unknown): {
  document: EditorDocument;
  values: Record<string, string>;
} {
  const concrete = materializeAutomationDocument(source, campaignAutomationInput(content));
  if (concrete.errors.length) {
    throw new Error(`Automation input validation failed: ${concrete.errors.map((e) => `${e.variable}: ${e.message}`).join("; ")}`);
  }
  return { document: concrete.document, values: concrete.values };
}
