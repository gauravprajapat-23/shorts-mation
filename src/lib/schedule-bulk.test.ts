import { describe, expect, it } from "vitest";
import { buildScheduleCsv, parseScheduleCsv, spreadSchedule } from "@/lib/schedule-bulk";

describe("V2.15 schedule bulk helpers", () => {
  it("exports timezone metadata", () => {
    const csv = buildScheduleCsv([{ id: "a", video_file_name: "a.mp4", title: "A", status: "pending", schedule_at: "2026-09-02T12:30:00.000Z", privacy: "private", timezone: "Asia/Kolkata" }]);
    expect(csv).toContain("timezone");
    expect(csv).toContain("Asia/Kolkata");
  });

  it("rejects unknown ids without producing updates", () => {
    const result = parseScheduleCsv("id,schedule_at\nwrong,2026-09-02 18:30", new Set(["known"]));
    expect(result.updates).toHaveLength(0);
    expect(result.errors[0]).toContain("not part of this campaign");
  });

  it("rejects invalid privacy values", () => {
    const result = parseScheduleCsv("id,schedule_at,privacy\nknown,2026-09-02 18:30,friends-only", new Set(["known"]));
    expect(result.updates).toHaveLength(0);
    expect(result.errors[0]).toContain("invalid privacy");
  });

  it("spreads schedules deterministically", () => {
    const start = new Date("2026-09-02T00:00:00.000Z");
    const updates = spreadSchedule(["a", "b", "c"], start, 2);
    expect(updates.map((u) => u.schedule_at)).toEqual([
      "2026-09-02T00:00:00.000Z", "2026-09-02T02:00:00.000Z", "2026-09-02T04:00:00.000Z",
    ]);
  });
});
