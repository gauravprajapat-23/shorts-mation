import { describe, expect, it } from "vitest";
import { campaignEta, campaignProgress, scheduleConflictIds } from "./campaign-operations";

describe("V2.19 campaign operations", () => {
  const items = [
    { id:"a", status:"uploaded", schedule_at:"2026-09-03T10:00:00Z" },
    { id:"b", status:"pending", schedule_at:"2026-09-04T10:00:00Z" },
    { id:"c", status:"failed", schedule_at:"2026-09-04T10:00:30Z", is_paused:true },
  ];
  it("computes campaign progress", () => expect(campaignProgress(items)).toMatchObject({ total:3, completed:1, remaining:2, failed:1, paused:1, percent:33 }));
  it("estimates completion from the latest non-paused publish time", () => expect(campaignEta(items, 0)).toBe("2026-09-04T10:00:00.000Z"));
  it("detects near-identical schedule conflicts", () => expect([...scheduleConflictIds(items)].sort()).toEqual(["b","c"]));
});
