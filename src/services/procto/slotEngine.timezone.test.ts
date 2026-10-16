import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScheduleMode } from "@prisma/client";
import {
  countBookingsForSlot,
  filterWaBookableSlotChoices,
  formatPracticeDateTime,
  formatPracticeTime,
  generateTimeSlots,
  isClinicDayAfterToday,
  isDateWithinValidity,
  isSlotStartBookable,
  parseLocalDate,
  PATIENT_BOOKING_HORIZON_DAYS,
  TIME_SLOT_CAPACITY,
  zonedDateTime,
} from "./slotEngine.js";

describe("practice timezone (Asia/Kolkata)", () => {
  it("stores 11:40 clinic time as 06:10Z", () => {
    const d = zonedDateTime("2026-09-25", "11:40");
    assert.equal(d.toISOString(), "2026-09-25T06:10:00.000Z");
    assert.equal(formatPracticeTime(d), "11:40");
    assert.equal(formatPracticeDateTime(d), "25/09/2026 11:40");
  });

  it("parseLocalDate is midnight IST (previous day 18:30Z)", () => {
    const d = parseLocalDate("2026-09-25");
    assert.equal(d.toISOString(), "2026-09-24T18:30:00.000Z");
  });
});

describe("patient booking horizon", () => {
  it("allows a day well past the old 7-day window and inside 90 days", () => {
    const later = new Date();
    later.setDate(later.getDate() + 30);
    assert.equal(PATIENT_BOOKING_HORIZON_DAYS, 90);
    assert.equal(isDateWithinValidity(later, PATIENT_BOOKING_HORIZON_DAYS), true);
    assert.equal(isDateWithinValidity(later, 7), false);
  });
});

describe("visit documentation day", () => {
  it("allows any time on today and blocks the next day", () => {
    const now = zonedDateTime("2026-10-12", "19:35");
    assert.equal(isClinicDayAfterToday("2026-10-12", now), false);
    assert.equal(isClinicDayAfterToday("2026-10-13", now), true);
  });
});

describe("isSlotStartBookable", () => {
  it("rejects past and exact-now starts", () => {
    const now = Date.parse("2026-09-25T06:10:00.000Z");
    assert.equal(isSlotStartBookable("2026-09-25T06:09:00.000Z", now), false);
    assert.equal(isSlotStartBookable("2026-09-25T06:10:00.000Z", now), false);
  });

  it("at 10:01 AM clinic time, 10:00 AM is not bookable", () => {
    const now = zonedDateTime("2026-09-26", "10:01").getTime();
    const tenAm = zonedDateTime("2026-09-26", "10:00");
    const tenThirty = zonedDateTime("2026-09-26", "10:30");
    assert.equal(formatPracticeTime(tenAm), "10:00");
    assert.equal(isSlotStartBookable(tenAm, now), false);
    assert.equal(isSlotStartBookable(tenThirty, now), true);
  });

  it("accepts future starts", () => {
    const now = Date.parse("2026-09-25T06:10:00.000Z");
    assert.equal(isSlotStartBookable("2026-09-25T06:10:01.000Z", now), true);
    assert.equal(
      isSlotStartBookable(zonedDateTime("2026-09-25", "12:00"), now),
      true,
    );
  });

  it("rejects invalid input", () => {
    assert.equal(isSlotStartBookable(null), false);
    assert.equal(isSlotStartBookable("not-a-date"), false);
  });
});

describe("generateTimeSlots omits past starts", () => {
  it("does not list 10:00 AM when clinic clock is 10:01 AM", () => {
    const day = parseLocalDate("2026-09-26");
    const nowMs = zonedDateTime("2026-09-26", "10:01").getTime();
    const schedule = {
      mode: ScheduleMode.TIME_BASED,
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "12:00",
      slotIntervalMin: 30,
      maxPerSlot: 1,
      breakStartTime: null,
      breakEndTime: null,
    } as any;

    const slots = generateTimeSlots(schedule, day, [], [], nowMs);
    const labels = slots.map((s) => formatPracticeTime(s.start));
    assert.equal(labels.includes("10:00"), false);
    assert.ok(labels.includes("10:30"));
    assert.ok(labels.includes("11:00"));
    assert.equal(labels.includes("09:00"), false);
    assert.equal(labels.includes("09:30"), false);
    for (const s of slots) {
      assert.equal(isSlotStartBookable(s.start, nowMs), true);
    }
  });

  it("WA-style button filter drops past starts from a stale choice list", () => {
    const nowMs = zonedDateTime("2026-09-26", "10:01").getTime();
    const stale = [
      {
        start: zonedDateTime("2026-09-26", "10:00").toISOString(),
        label: "10:00 AM",
      },
      {
        start: zonedDateTime("2026-09-26", "10:30").toISOString(),
        label: "10:30 AM",
      },
      {
        start: zonedDateTime("2026-09-26", "11:00").toISOString(),
        label: "11:00 AM",
      },
    ];
    const buttons = filterWaBookableSlotChoices(stale, nowMs).map((c) => c.label);
    assert.deepEqual(buttons, ["10:30 AM", "11:00 AM"]);
    assert.equal(buttons.includes("10:00 AM"), false);
  });
});

describe("WA past-slot buttons — confirmed 1000 times", () => {
  it("never emits a past or exact-now start as a button across 1000 clock ticks", () => {
    const day = parseLocalDate("2026-09-26");
    const schedule = {
      mode: ScheduleMode.TIME_BASED,
      dayOfWeek: 6,
      startTime: "09:00",
      endTime: "18:00",
      slotIntervalMin: 15,
      maxPerSlot: 1,
      breakStartTime: null,
      breakEndTime: null,
    } as any;

    const dayStart = zonedDateTime("2026-09-26", "09:00").getTime();
    let confirmed = 0;
    for (let i = 0; i < 1000; i++) {
      const nowMs = dayStart + i * 15_000;
      const slots = generateTimeSlots(schedule, day, [], [], nowMs);

      const stale: Array<{ start: string; label: string }> = [];
      for (let m = 9 * 60; m <= 17 * 60 + 30; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, "0");
        const mm = String(m % 60).padStart(2, "0");
        const start = zonedDateTime("2026-09-26", `${hh}:${mm}`);
        stale.push({
          start: start.toISOString(),
          label: formatPracticeTime(start),
        });
      }

      const buttons = filterWaBookableSlotChoices(stale, nowMs);
      for (const b of buttons) {
        assert.equal(
          isSlotStartBookable(b.start, nowMs),
          true,
          `iteration ${i}: button ${b.label} must be bookable at now`,
        );
      }
      for (const s of slots) {
        assert.ok(s.start.getTime() > nowMs, `iteration ${i}: generator past`);
        assert.equal(isSlotStartBookable(s.start, nowMs), true);
      }
      confirmed += 1;
    }
    assert.equal(confirmed, 1000);
  });
});

describe("time slot exclusivity", () => {
  it("counts one booking per wall-clock minute", () => {
    const slot = zonedDateTime("2026-09-25", "11:40");
    const bookings = [
      {
        mode: ScheduleMode.TIME_BASED,
        slotStart: zonedDateTime("2026-09-25", "11:40"),
      },
      {
        mode: ScheduleMode.TIME_BASED,
        slotStart: zonedDateTime("2026-09-25", "12:10"),
      },
    ];
    assert.equal(TIME_SLOT_CAPACITY, 1);
    assert.equal(countBookingsForSlot(bookings, slot), 1);
    assert.ok(countBookingsForSlot(bookings, slot) >= TIME_SLOT_CAPACITY);
  });
});
