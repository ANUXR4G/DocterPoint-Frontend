import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BookingStatus,
  OverrideType,
  ScheduleMode,
  type PracticeBooking,
  type ProviderSchedule,
  type ScheduleOverride,
} from "@prisma/client";
import { checkExtraWindow, dayWindows, hm12 } from "./calendarSlots.js";
import {
  generateExtraSlotsFromOverrides,
  generateTimeSlots,
  getTokenSession,
  hasExtraSlotsForDay,
  parseLocalDate,
  startOfLocalDay,
} from "./slotEngine.js";

const WED = "2026-09-30";
const THU = "2026-10-01";

function row(dayOfWeek: number, over: Partial<ProviderSchedule> = {}): ProviderSchedule {
  return {
    id: `r-${dayOfWeek}`,
    practiceId: "p",
    providerId: "d",
    locationId: "loc",
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
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as ProviderSchedule;
}

function override(type: OverrideType, day: string, over: Partial<ScheduleOverride> = {}): ScheduleOverride {
  return {
    id: `o-${type}`,
    practiceId: "p",
    providerId: "d",
    date: startOfLocalDay(parseLocalDate(day)),
    type,
    startTime: null,
    endTime: null,
    maxTokens: null,
    reason: null,
    createdAt: new Date(0),
    ...over,
  } as ScheduleOverride;
}

const weekRows = [row(1), row(3, { breakStartTime: "12:00", breakEndTime: "12:40" }), row(5)];

describe("calendar quick slots", () => {
  test("day windows split hours around the break and list extra / blocked time", () => {
    const d = dayWindows(
      weekRows,
      [
        override(OverrideType.EXTRA_SLOT, WED, { id: "x1", startTime: "17:00", endTime: "18:00", reason: "Evening" }),
        override(OverrideType.BLOCK_SLOT, WED, { startTime: "19:00", endTime: "19:30" }),
      ],
      parseLocalDate(WED),
    );
    assert.deepEqual(d.hours, [
      { start: "10:00", end: "12:00" },
      { start: "12:40", end: "14:00" },
    ]);
    assert.deepEqual(d.extra, [{ id: "x1", start: "17:00", end: "18:00", note: "Evening" }]);
    assert.equal(d.blocked.length, 1);
    assert.equal(d.dayOff, null);
    assert.equal(d.slotIntervalMin, 20);
  });

  test("a day off still uses the doctor's slot length (same as the booking path)", () => {
    const d = dayWindows(weekRows, [], parseLocalDate(THU));
    assert.deepEqual(d.hours, []);
    assert.equal(d.slotIntervalMin, 20);
    assert.equal(d.mode, ScheduleMode.TIME_BASED);
  });

  test("valid window outside hours counts whole slots; the break counts as free", () => {
    const d = dayWindows(weekRows, [], parseLocalDate(WED));
    assert.deepEqual(checkExtraWindow({ start: "17:00", end: "18:00" }, d), { ok: true, slots: 3 });
    assert.deepEqual(checkExtraWindow({ start: "14:00", end: "14:50" }, d), { ok: true, slots: 2 });
    assert.deepEqual(checkExtraWindow({ start: "12:00", end: "12:40" }, d), { ok: true, slots: 2 });
  });

  test("rejects overlap with hours, extra slots, blocks, leave, short or past windows", () => {
    const d = dayWindows(
      weekRows,
      [override(OverrideType.EXTRA_SLOT, WED, { startTime: "17:00", endTime: "18:00" })],
      parseLocalDate(WED),
    );
    const err = (w: { start: string; end: string }, nowMin?: number, day = d) => {
      const r = checkExtraWindow(w, day, nowMin);
      return r.ok ? "" : r.error;
    };
    assert.match(err({ start: "13:40", end: "15:00" }), /overlaps regular hours 12:40 PM–2:00 PM/);
    assert.match(err({ start: "17:40", end: "19:00" }), /already cover 5:00 PM–6:00 PM/);
    assert.match(err({ start: "15:00", end: "15:10" }), /at least 20 minutes/);
    assert.match(err({ start: "15:00", end: "14:00" }), /after the start/);
    assert.match(err({ start: "9am", end: "10:00" }), /HH:MM/);
    assert.match(err({ start: "15:00", end: "16:00" }, 16 * 60), /already passed/);
    assert.deepEqual(checkExtraWindow({ start: "15:00", end: "16:00" }, d, 15 * 60 + 5), { ok: true, slots: 2 });

    const leave = dayWindows(weekRows, [override(OverrideType.EMERGENCY_LEAVE, WED)], parseLocalDate(WED));
    assert.match(err({ start: "17:00", end: "18:00" }, undefined, leave), /on leave/);
    const block = dayWindows(
      weekRows,
      [override(OverrideType.BLOCK_SLOT, WED, { startTime: "18:00", endTime: "19:00" })],
      parseLocalDate(WED),
    );
    assert.match(err({ start: "18:30", end: "19:30" }, undefined, block), /blocked/);
    const token = dayWindows([row(3, { mode: ScheduleMode.TOKEN_BASED })], [], parseLocalDate(WED));
    assert.match(err({ start: "17:00", end: "18:00" }, undefined, token), /token queue/);
  });

  test("date columns read back from Postgres match their clinic day", () => {
    // Clinic midnight 5 Nov (IST) is stored in a DATE column as 2026-11-04 and read back as UTC midnight.
    const stored = new Date("2026-11-04T00:00:00.000Z");
    const nov5 = parseLocalDate("2026-11-05");
    const past = Date.parse("2026-10-01T00:00:00Z");
    const extra = generateExtraSlotsFromOverrides(
      [override(OverrideType.EXTRA_SLOT, "2026-11-05", { date: stored, startTime: "17:00", endTime: "18:00" })],
      nov5,
      [],
      20,
      1,
      past,
    );
    assert.equal(extra.length, 3);
    assert.equal(
      hasExtraSlotsForDay([override(OverrideType.EXTRA_SLOT, "2026-11-05", { date: stored, startTime: "17:00", endTime: "18:00" })], nov5),
      true,
    );

    const leaveSlots = generateTimeSlots(
      row(4),
      nov5,
      [],
      [override(OverrideType.EMERGENCY_LEAVE, "2026-11-05", { date: stored })],
      past,
    );
    assert.ok(leaveSlots.length > 0);
    assert.ok(leaveSlots.every((s) => !s.available), "leave day must block every slot");

    const tokenRow = row(4, { mode: ScheduleMode.TOKEN_BASED, sessionStart: "10:00", sessionEnd: "23:59", maxTokens: 20 });
    const booked = [
      { mode: ScheduleMode.TOKEN_BASED, status: BookingStatus.ACCEPTED, sessionDate: stored, tokenNumber: 4 },
    ] as unknown as PracticeBooking[];
    const session = getTokenSession(tokenRow, nov5, booked, []);
    assert.equal(session?.issued, 1);
    assert.equal(session?.nextToken, 5);
  });

  test("hm12 formats clinic times", () => {
    assert.equal(hm12("00:05"), "12:05 AM");
    assert.equal(hm12("12:00"), "12:00 PM");
    assert.equal(hm12("17:40"), "5:40 PM");
  });
});
