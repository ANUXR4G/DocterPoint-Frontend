import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScheduleMode } from "@prisma/client";
import {
  countBookingsForSlot,
  formatPracticeTime,
  isSlotStartBookable,
  parseLocalDate,
  TIME_SLOT_CAPACITY,
  zonedDateTime,
} from "./slotEngine.js";

describe("practice timezone (Asia/Kolkata)", () => {
  it("stores 11:40 clinic time as 06:10Z", () => {
    const d = zonedDateTime("2026-09-25", "11:40");
    assert.equal(d.toISOString(), "2026-09-25T06:10:00.000Z");
    assert.equal(formatPracticeTime(d), "11:40 AM");
  });

  it("parseLocalDate is midnight IST (previous day 18:30Z)", () => {
    const d = parseLocalDate("2026-09-25");
    assert.equal(d.toISOString(), "2026-09-24T18:30:00.000Z");
  });
});

describe("isSlotStartBookable", () => {
  it("rejects past and exact-now starts", () => {
    const now = Date.parse("2026-09-25T06:10:00.000Z");
    assert.equal(isSlotStartBookable("2026-09-25T06:09:00.000Z", now), false);
    assert.equal(isSlotStartBookable("2026-09-25T06:10:00.000Z", now), false);
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
