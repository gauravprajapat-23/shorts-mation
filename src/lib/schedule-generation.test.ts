import { describe, expect, it } from "vitest";
import { generateCampaignSchedule } from "@/lib/schedule-generation";

describe("generateCampaignSchedule", () => {
  it("preserves file schedules and nulls", () => {
    expect(generateCampaignSchedule({ mode:"file", timezone:"UTC", perDay:3, dailyTime:"18:00", skipWeekends:false, count:2, fileSchedule:["2026-09-03T12:00:00Z", null] }))
      .toEqual(["2026-09-03T12:00:00.000Z", null]);
  });

  it("creates multiple same-day slots for x_per_day", () => {
    const rows = generateCampaignSchedule({ mode:"x_per_day", timezone:"UTC", perDay:3, dailyTime:"18:00", skipWeekends:false, count:3, now:new Date("2026-09-02T12:00:00Z") });
    expect(rows).toEqual(["2026-09-02T18:00:00.000Z", "2026-09-02T20:00:00.000Z", "2026-09-02T22:00:00.000Z"]);
  });

  it("skips weekends for daily schedules", () => {
    const rows = generateCampaignSchedule({ mode:"daily_time", timezone:"UTC", perDay:1, dailyTime:"09:00", skipWeekends:true, count:2, now:new Date("2026-09-04T10:00:00Z") });
    expect(rows).toEqual(["2026-09-07T09:00:00.000Z", "2026-09-08T09:00:00.000Z"]);
  });
});
