import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTimeForDisplay,
  msUntilNextScheduleBoundary,
  normalizeTimeHhMm,
  parseTimeToMinutes,
  publicAvailabilityCopy,
  publicJoinBlockedReason,
  validateTimezone,
  validateWeeklySchedule,
  type DayScheduleInput,
} from "../../lib/business/hours.ts";

function openWeek(overrides: Partial<DayScheduleInput>[] = []): DayScheduleInput[] {
  const base: DayScheduleInput[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday: weekday as DayScheduleInput["weekday"],
    isClosed: false,
    openTime: "09:00",
    closeTime: "17:00",
  }));
  for (const override of overrides) {
    const idx = base.findIndex((d) => d.weekday === override.weekday);
    if (idx >= 0) {
      base[idx] = { ...base[idx], ...override };
    }
  }
  return base;
}

describe("normalizeTimeHhMm / parseTimeToMinutes", () => {
  it("normalizes HH:MM and HH:MM:SS", () => {
    assert.equal(normalizeTimeHhMm("9:30"), "09:30");
    assert.equal(normalizeTimeHhMm("09:30:00"), "09:30");
    assert.equal(normalizeTimeHhMm("25:00"), null);
    assert.equal(normalizeTimeHhMm("ab:cd"), null);
  });

  it("parses minutes", () => {
    assert.equal(parseTimeToMinutes("09:00"), 540);
    assert.equal(parseTimeToMinutes("17:30"), 1050);
    assert.equal(parseTimeToMinutes("bad"), null);
  });
});

describe("validateTimezone", () => {
  it("accepts curated IANA zones", () => {
    assert.equal(validateTimezone("UTC").ok, true);
    assert.equal(validateTimezone("Africa/Addis_Ababa").ok, true);
    assert.equal(validateTimezone("America/New_York").ok, true);
  });

  it("rejects empty / malformed", () => {
    assert.equal(validateTimezone("").ok, false);
    assert.equal(validateTimezone("EST").ok, false);
    assert.equal(validateTimezone("+03:00").ok, false);
  });
});

describe("validateWeeklySchedule", () => {
  it("accepts a valid week", () => {
    const result = validateWeeklySchedule(openWeek());
    assert.equal(result.ok, true);
  });

  it("accepts closed days", () => {
    const result = validateWeeklySchedule(
      openWeek([
        { weekday: 6, isClosed: true, openTime: "", closeTime: "" },
        { weekday: 7, isClosed: true, openTime: "", closeTime: "" },
      ]),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value[5].is_closed, true);
      assert.equal(result.value[5].open_time, null);
    }
  });

  it("rejects missing times on open days", () => {
    const result = validateWeeklySchedule(
      openWeek([{ weekday: 1, openTime: "", closeTime: "17:00" }]),
    );
    assert.equal(result.ok, false);
  });

  it("rejects start >= end and zero-length", () => {
    assert.equal(
      validateWeeklySchedule(
        openWeek([{ weekday: 1, openTime: "17:00", closeTime: "09:00" }]),
      ).ok,
      false,
    );
    assert.equal(
      validateWeeklySchedule(
        openWeek([{ weekday: 1, openTime: "09:00", closeTime: "09:00" }]),
      ).ok,
      false,
    );
  });

  it("rejects malformed times", () => {
    assert.equal(
      validateWeeklySchedule(
        openWeek([{ weekday: 1, openTime: "9am", closeTime: "17:00" }]),
      ).ok,
      false,
    );
  });
});

describe("display helpers", () => {
  it("formats AM/PM times", () => {
    assert.equal(formatTimeForDisplay("09:00"), "9:00 AM");
    assert.equal(formatTimeForDisplay("17:00"), "5:00 PM");
  });

  it("builds open / closed / closed-today copy", () => {
    assert.deepEqual(
      publicAvailabilityCopy({
        businessIsOpen: true,
        todayIsClosed: false,
        todayOpenTime: "09:00",
        todayCloseTime: "17:00",
        timezone: "UTC",
      }),
      {
        statusLabel: "Open",
        detail: "Hours today: 9:00 AM – 5:00 PM",
      },
    );

    assert.deepEqual(
      publicAvailabilityCopy({
        businessIsOpen: false,
        todayIsClosed: true,
        todayOpenTime: null,
        todayCloseTime: null,
        timezone: "UTC",
      }),
      { statusLabel: "Closed today", detail: null },
    );

    // Before open on an otherwise open day (UTC 08:00 with 09–17)
    const before = publicAvailabilityCopy(
      {
        businessIsOpen: false,
        todayIsClosed: false,
        todayOpenTime: "09:00",
        todayCloseTime: "17:00",
        timezone: "UTC",
      },
      new Date("2026-06-01T08:00:00Z"),
    );
    assert.equal(before.statusLabel, "Closed");
    assert.equal(before.detail, "Opens at 9:00 AM");

    const after = publicAvailabilityCopy(
      {
        businessIsOpen: false,
        todayIsClosed: false,
        todayOpenTime: "09:00",
        todayCloseTime: "17:00",
        timezone: "UTC",
      },
      new Date("2026-06-01T18:00:00Z"),
    );
    assert.equal(after.statusLabel, "Closed");
    assert.equal(after.detail, null);
  });

  it("separates queue status from business hours for join blocking", () => {
    assert.equal(
      publicJoinBlockedReason({
        businessIsOpen: false,
        queueStatus: "open",
        isFull: false,
      }),
      "Business closed",
    );
    assert.equal(
      publicJoinBlockedReason({
        businessIsOpen: true,
        queueStatus: "paused",
        isFull: false,
      }),
      "Queue paused",
    );
    assert.equal(
      publicJoinBlockedReason({
        businessIsOpen: true,
        queueStatus: "closed",
        isFull: false,
      }),
      "Queue closed",
    );
    assert.equal(
      publicJoinBlockedReason({
        businessIsOpen: true,
        queueStatus: "open",
        isFull: true,
      }),
      "Queue full",
    );
    assert.equal(
      publicJoinBlockedReason({
        businessIsOpen: true,
        queueStatus: "open",
        isFull: false,
      }),
      null,
    );
  });

  it("computes a positive schedule boundary delay", () => {
    const ms = msUntilNextScheduleBoundary(
      {
        businessIsOpen: true,
        todayIsClosed: false,
        todayOpenTime: "09:00",
        todayCloseTime: "17:00",
        timezone: "UTC",
      },
      new Date("2026-06-01T12:00:00Z"),
    );
    assert.ok(ms > 0);
    // Until 17:00 UTC → 5 hours
    assert.ok(ms <= 5 * 60 * 60 * 1000);
  });
});
