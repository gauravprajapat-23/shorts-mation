import { describe, expect, it } from "vitest";
import { effectivePublishAt, formatDateTime } from "./date-display";

describe("campaign schedule display", () => {
  it("prefers the authoritative YouTube publish time", () => {
    expect(effectivePublishAt({ schedule_at: "2026-09-02T12:00:00Z", youtube_publish_at: "2026-09-02T13:00:00Z" }))
      .toBe("2026-09-02T13:00:00Z");
  });

  it("falls back to the local campaign schedule", () => {
    expect(effectivePublishAt({ schedule_at: "2026-09-02T12:00:00Z" })).toBe("2026-09-02T12:00:00Z");
  });

  it("formats valid dates without throwing for an invalid timezone", () => {
    expect(formatDateTime("2026-09-02T12:00:00Z", "Not/AZone")).not.toBe("—");
  });
});
