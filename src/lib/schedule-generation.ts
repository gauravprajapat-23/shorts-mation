export type CampaignScheduleMode = "file" | "x_per_day" | "daily_time";

export type CampaignScheduleInput = {
  mode: CampaignScheduleMode;
  timezone: string;
  perDay: number;
  dailyTime: string;
  skipWeekends: boolean;
  count: number;
  fileSchedule?: Array<string | null | undefined>;
  now?: Date;
};

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const map = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), weekday: String(map.weekday),
  };
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const targetWall = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetWall;
  // Iterating the wall-clock difference resolves normal offsets and DST transitions
  // without adding a heavyweight timezone dependency.
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const representedWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    const delta = targetWall - representedWall;
    guess += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return new Date(guess);
}

function plusCalendarDays(parts: Pick<ZonedParts, "year" | "month" | "day">, days: number) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isWeekend(year: number, month: number, day: number, timeZone: string): boolean {
  const noon = zonedLocalToUtc(year, month, day, 12, 0, timeZone);
  const wd = zonedParts(noon, timeZone).weekday;
  return wd === "Sat" || wd === "Sun";
}

function parseDailyTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("Daily time must use HH:MM format");
  const hour = Number(m[1]), minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Daily time is invalid");
  return { hour, minute };
}

export function generateCampaignSchedule(input: CampaignScheduleInput): Array<string | null> {
  const count = Math.max(0, Math.min(5000, Math.floor(input.count)));
  if (!count) return [];
  // Validate the IANA zone immediately.
  formatter(input.timezone).format(new Date());

  if (input.mode === "file") {
    return Array.from({ length: count }, (_, i) => {
      const raw = input.fileSchedule?.[i];
      if (!raw || !String(raw).trim()) return null;
      const d = new Date(String(raw));
      if (!Number.isFinite(d.getTime())) throw new Error(`Row ${i + 1} has an invalid schedule_at`);
      return d.toISOString();
    });
  }

  const { hour, minute } = parseDailyTime(input.dailyTime);
  const perDay = input.mode === "daily_time" ? 1 : Math.max(1, Math.min(50, Math.floor(input.perDay || 1)));
  const now = input.now ?? new Date();
  const minTime = now.getTime() + 5 * 60_000;
  const nowParts = zonedParts(now, input.timezone);
  let calendar = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const out: string[] = [];

  // X-per-day slots are distributed from the selected first time through the
  // remaining local day. Example: 18:00 + 3/day => 18:00, 20:00, 22:00.
  const startMinutes = hour * 60 + minute;
  const stepMinutes = input.mode === "x_per_day"
    ? Math.max(1, Math.floor((24 * 60 - startMinutes) / perDay))
    : 0;

  let guard = 0;
  while (out.length < count && guard++ < 10000) {
    if (!input.skipWeekends || !isWeekend(calendar.year, calendar.month, calendar.day, input.timezone)) {
      for (let slot = 0; slot < perDay && out.length < count; slot++) {
        const total = startMinutes + slot * stepMinutes;
        if (total >= 24 * 60) break;
        const candidate = zonedLocalToUtc(
          calendar.year, calendar.month, calendar.day,
          Math.floor(total / 60), total % 60, input.timezone,
        );
        if (candidate.getTime() >= minTime) out.push(candidate.toISOString());
      }
    }
    calendar = plusCalendarDays(calendar, 1);
  }
  if (out.length !== count) throw new Error("Could not generate the requested campaign schedule");
  return out;
}
