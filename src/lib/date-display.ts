export type CampaignScheduleLike = {
  schedule_at?: string | null;
  youtube_publish_at?: string | null;
};

/** The remote YouTube publish time is authoritative once it exists. */
export function effectivePublishAt(item: CampaignScheduleLike): string | null {
  return item.youtube_publish_at ?? item.schedule_at ?? null;
}

export function formatDateTime(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
      timeZoneName: timeZone ? "short" : undefined,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
