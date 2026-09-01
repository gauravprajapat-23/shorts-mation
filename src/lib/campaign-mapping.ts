export function campaignSourceValue(video: { content?: Record<string, unknown>; seo?: Record<string, unknown> }, src: string): unknown {
  if (!src || src === "__none__") return "";
  if (src.startsWith("seo.")) return video.seo?.[src.slice(4)] ?? "";
  return video.content?.[src] ?? "";
}

export function displayCampaignValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return ""; }
}

export function hasCampaignValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}
