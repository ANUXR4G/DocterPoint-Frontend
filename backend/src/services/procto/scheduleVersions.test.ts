import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingStatus, ScheduleMode, type ProviderSchedule } from "@prisma/client";
import {
  bookingFitsSchedule,
  dbDate,
  earliestSafeDate,
  findConflicts,
  localDayOfSessionDate,
  pickEffectiveVersion,
  upcomingVersionKeys,
} from "./scheduleVersions.js";
import { parseLocalDate, zonedDateTime } from "./slotEngine.js";
import { PracticeService } from "./practice.service.js";

const LOC = "loc-1";

function row(
  dayOfWeek: number,
  effectiveFrom: string,
  over: Partial<ProviderSchedule> = {},
): ProviderSchedule {
  return {
    id: `${effectiveFrom}-${dayOfWeek}-${over.locationId ?? LOC}`,
    practiceId: "p",
    providerId: "d",
    locationId: LOC,
    dayOfWeek,
    mode: ScheduleMode.TIME_BASED,
    slotIntervalMin: 20,
    startTime: "10:00",
    endTime: "14:00",
    maxPerSlot: 1,
    sessionStart: null,
    sessionEnd: null,
    maxTokens: null,
    breakStartTime: null,
    breakEndTime: null,
    isActive: true,
    effectiveFrom: dbDate(effectiveFrom),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as ProviderSchedule;
}

function timeBooking(id: string, day: string, hhmm: string) {
  return {
    id,
    patientName: `Patient ${id}`,
    locationId: LOC,
    mode: ScheduleMode.TIME_BASED,
    slotStart: zonedDateTime(day, hhmm),
    sessionDate: null,
    status: BookingStatus.SCHEDULED,
  };
}

// 2026-10-05 and 2026-10-12 are Mondays (weekday 1).
const baseline = [row(1, "2000-01-01"), row(3, "2000-01-01")];

describe("pickEffectiveVersion", () => {
  const next = [row(2, "2026-10-15")];
  const rows = [...baseline, ...next];

  test("dates before effective_from use the old version", () => {
    assert.deepEqual(
      pickEffectiveVersion(rows, "2026-10-14").map((r) => r.dayOfWeek),
      [1, 3],
    );
  });
  test("dates on/after effective_from use the new version", () => {
    assert.deepEqual(pickEffectiveVersion(rows, "2026-10-15").map((r) => r.dayOfWeek), [2]);
    assert.deepEqual(pickEffectiveVersion(rows, "2027-01-01").map((r) => r.dayOfWeek), [2]);
  });
  test("each location has its own version", () => {
    const other = row(5, "2000-01-01", { locationId: "loc-2" });
    const picked = pickEffectiveVersion([...rows, other], "2026-10-20");
    assert.deepEqual(picked.map((r) => r.dayOfWeek).sort(), [2, 5]);
  });
  test("upcoming versions after a day, oldest first", () => {
    const later = row(4, "2026-12-01");
    assert.deepEqual(upcomingVersionKeys([...rows, later], "2026-09-28"), [
      "2026-10-15",
      "2026-12-01",
    ]);
    assert.deepEqual(upcomingVersionKeys(rows, "2026-10-15"), []);
  });
});

describe("localDayOfSessionDate", () => {
  test("maps a stored clinic-midnight DATE back to the clinic day", () => {
    const stored = new Date(`${parseLocalDate("2026-10-05").toISOString().slice(0, 10)}T00:00:00Z`);
    assert.equal(localDayOfSessionDate(stored), "2026-10-05");
  });
});

describe("bookingFitsSchedule", () => {
  test("slot start on the grid of a working day fits", () => {
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-05", "10:20"), baseline), true);
  });
  test("off-grid time, non-working day or other mode does not fit", () => {
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-05", "10:10"), baseline), false);
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-06", "10:20"), baseline), false);
    const tokens = [
      row(1, "2000-01-01", {
        mode: ScheduleMode.TOKEN_BASED,
        startTime: null,
        endTime: null,
        slotIntervalMin: null,
        sessionStart: "10:00",
        sessionEnd: "14:00",
        maxTokens: 20,
      }),
    ];
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-05", "10:20"), tokens), false);
  });
  test("a time inside the new break does not fit", () => {
    const withBreak = [row(1, "2026-10-01", { breakStartTime: "12:00", breakEndTime: "13:00" })];
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-05", "12:20"), withBreak), false);
    assert.equal(bookingFitsSchedule(timeBooking("a", "2026-10-05", "13:00"), withBreak), true);
  });
});

describe("findConflicts / earliestSafeDate", () => {
  const next = [row(1, "2026-10-01", { endTime: "12:00" })];
  const bookings = [
    timeBooking("past-of-change", "2026-09-28", "13:00"),
    timeBooking("fits-both", "2026-10-05", "10:20"),
    timeBooking("conflict-1", "2026-10-05", "13:00"),
    timeBooking("conflict-2", "2026-10-12", "12:40"),
    timeBooking("already-odd", "2026-10-05", "10:10"),
  ];

  test("only bookings valid now but invalid under the new version, from the start date", () => {
    const conflicts = findConflicts(bookings, baseline, next, "2026-10-01");
    assert.deepEqual(
      conflicts.map((c) => c.bookingId),
      ["conflict-1", "conflict-2"],
    );
    assert.equal(conflicts[0]!.day, "2026-10-05");
    assert.match(conflicts[0]!.reason, /outside the new hours/);
  });
  test("a dropped working day is reported as such", () => {
    const noMonday = [row(3, "2026-10-01")];
    const [c] = findConflicts([bookings[1]!], baseline, noMonday, "2026-10-01");
    assert.equal(c?.reason, "Day is no longer a working day");
  });
  test("safe date is the day after the last conflict", () => {
    const conflicts = findConflicts(bookings, baseline, next, "2026-10-01");
    assert.equal(earliestSafeDate(conflicts, "2026-10-01"), "2026-10-13");
    assert.equal(earliestSafeDate([], "2026-10-01"), "2026-10-01");
    assert.equal(earliestSafeDate(conflicts, "2026-11-01"), "2026-11-01");
  });
});

describe("resolveEffectiveFrom", () => {
  const today = "2026-09-28";
  test("defaults to the minimum and never goes into the past", () => {
    assert.equal(PracticeService.resolveEffectiveFrom(undefined, today), today);
    assert.equal(PracticeService.resolveEffectiveFrom("", today), today);
    assert.equal(PracticeService.resolveEffectiveFrom("2026-09-01", today), today);
    assert.equal(PracticeService.resolveEffectiveFrom("2026-10-15", today), "2026-10-15");
  });
  test("rejects bad formats and dates more than a year ahead", () => {
    assert.throws(() => PracticeService.resolveEffectiveFrom("15/10/2026", today));
    assert.throws(() => PracticeService.resolveEffectiveFrom("2027-12-01", today));
  });
});
