export type OperationalItem = {
  id: string;
  status: string;
  schedule_at?: string | null;
  youtube_publish_at?: string | null;
  is_paused?: boolean | null;
};

export function campaignProgress(items: OperationalItem[]) {
  const total = items.length;
  const completed = items.filter((i) => i.status === "uploaded").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const paused = items.filter((i) => i.is_paused).length;
  const remaining = Math.max(0, total - completed);
  return { total, completed, failed, paused, remaining, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function campaignEta(items: OperationalItem[], now = Date.now()): string | null {
  const pending = items.filter((i) => i.status !== "uploaded" && !i.is_paused);
  const timestamps = pending.map((i) => i.youtube_publish_at ?? i.schedule_at).filter(Boolean).map((v) => new Date(v!).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return null;
  const latest = Math.max(...timestamps);
  return new Date(Math.max(now, latest)).toISOString();
}

export function scheduleConflictIds(items: OperationalItem[], toleranceMs = 60_000): Set<string> {
  const scheduled = items.map((item) => ({ item, t: new Date(item.youtube_publish_at ?? item.schedule_at ?? "").getTime() })).filter((x) => Number.isFinite(x.t)).sort((a,b) => a.t-b.t);
  const ids = new Set<string>();
  for (let i=1;i<scheduled.length;i++) {
    if (scheduled[i]!.t - scheduled[i-1]!.t < toleranceMs) {
      ids.add(scheduled[i]!.item.id); ids.add(scheduled[i-1]!.item.id);
    }
  }
  return ids;
}

export function groupItemsByLocalDay(items: OperationalItem[], timezone: string): Map<string, OperationalItem[]> {
  const result = new Map<string, OperationalItem[]>();
  for (const item of items) {
    const raw = item.youtube_publish_at ?? item.schedule_at;
    if (!raw) continue;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(raw));
    result.set(day, [...(result.get(day) ?? []), item]);
  }
  return result;
}
