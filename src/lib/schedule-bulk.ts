// Bulk schedule editing helpers: export the queue as a spreadsheet-friendly
// CSV, edit the schedule_at column in Excel/Sheets, re-import to update every
// row's publish time in one shot.
import Papa from "papaparse";

export type ScheduleRow = {
  id: string;
  video_file_name: string | null;
  title: string;
  status: string;
  schedule_at: string | null;
  privacy: string;
  timezone?: string;
};

export type ScheduleUpdate = { id: string; schedule_at: string | null; privacy?: string };
export type ScheduleImportResult = { updates: ScheduleUpdate[]; errors: string[] };

const PRIVACY = new Set(["private", "unlisted", "public"]);

/** Local-time value Excel/Sheets show nicely: "2026-08-05 18:30". */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Accepts "2026-08-05 18:30", "2026-08-05T18:30", full ISO with offset,
 *  "05/08/2026 18:30" (day-first) and blank (= clear the schedule). */
export function parseScheduleValue(raw: string): { iso: string | null } | { error: string } {
  const v = (raw ?? "").trim();
  if (!v) return { iso: null };
  const dayFirst = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (dayFirst) {
    const [, d, m, y, hh, mm] = dayFirst;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
    return isNaN(dt.getTime()) ? { error: `invalid date "${v}"` } : { iso: dt.toISOString() };
  }
  const normalized = /\d{4}-\d{2}-\d{2}[ ]\d{1,2}:\d{2}/.test(v) ? v.replace(" ", "T") : v;
  const dt = new Date(normalized);
  if (isNaN(dt.getTime())) return { error: `invalid date "${v}"` };
  return { iso: dt.toISOString() };
}

export function buildScheduleCsv(rows: ScheduleRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      id: r.id,
      video_file_name: r.video_file_name ?? "",
      title: r.title,
      status: r.status,
      schedule_at: toLocalInput(r.schedule_at),
      privacy: r.privacy,
      timezone: r.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    })),
  );
}

export function parseScheduleCsv(text: string, knownIds: Set<string>): ScheduleImportResult {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const updates: ScheduleUpdate[] = [];
  const errors: string[] = [];
  parsed.data.forEach((row, i) => {
    const line = i + 2;
    const id = (row.id ?? "").trim();
    if (!id) {
      errors.push(`Row ${line}: missing id column — keep the exported id column intact.`);
      return;
    }
    if (!knownIds.has(id)) {
      errors.push(`Row ${line}: id ${id.slice(0, 8)}… is not part of this campaign.`);
      return;
    }
    const res = parseScheduleValue(row.schedule_at ?? "");
    if ("error" in res) {
      errors.push(`Row ${line}: ${res.error} (use 2026-08-05 18:30)`);
      return;
    }
    const privacy = (row.privacy ?? "").trim().toLowerCase();
    if (privacy && !PRIVACY.has(privacy)) {
      errors.push(`Row ${line}: invalid privacy "${privacy}" (use private, unlisted, or public)`);
      return;
    }
    updates.push({ id, schedule_at: res.iso, ...(PRIVACY.has(privacy) ? { privacy } : {}) });
  });
  return { updates, errors };
}

/** Evenly spread rows starting at `start`, one every `everyHours`. */
export function spreadSchedule(ids: string[], start: Date, everyHours: number): ScheduleUpdate[] {
  return ids.map((id, i) => ({
    id,
    schedule_at: new Date(start.getTime() + i * everyHours * 3600_000).toISOString(),
  }));
}
