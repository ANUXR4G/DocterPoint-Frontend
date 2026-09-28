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
import { checkExtraWindow, dayWindows, hm12, parseSlotOptions, planExtraSlots } from "./calendarSlots.js";
import { deniedFor, permissionScope, permissionsFor } from "./practicePermissions.js";
import {
  generateExtraSlotsFromOverrides,
  generateTimeSlots,
  getTokenSession,
  hasExtraSlotsForDay,
  parseLocalDate,
  startOfLocalDay,
  timeSlotsForProviderDay,
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
    effectiveFrom: new Date("2000-01-01T00:00:00.000Z"),
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
    assert.deepEqual(d.breaks, [{ start: "12:00", end: "12:40" }]);
    assert.equal(d.weekday, 3);
    assert.deepEqual(d.extra, [
      {
        id: "x1",
        start: "17:00",
        end: "18:00",
        note: "Evening",
        slotIntervalMin: 20,
        capacity: 1,
        seriesId: null,
      },
    ]);
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

  test("valid window outside hours counts whole slots; the break is allowed with a warning", () => {
    const d = dayWindows(weekRows, [], parseLocalDate(WED));
    assert.deepEqual(checkExtraWindow({ start: "17:00", end: "18:00" }, d), { ok: true, slots: 3, warnings: [] });
    assert.deepEqual(checkExtraWindow({ start: "14:00", end: "14:50" }, d), { ok: true, slots: 2, warnings: [] });
    assert.deepEqual(checkExtraWindow({ start: "12:00", end: "12:40" }, d), {
      ok: true,
      slots: 2,
      warnings: [
        { code: "break", message: "Doctor is marked on break during this time.", detail: "Break 12:00 PM–12:40 PM" },
      ],
    });
  });

  test("leave, blocked time and off-duty days warn instead of refusing", () => {
    const codes = (day: ReturnType<typeof dayWindows>, w = { start: "17:00", end: "18:00" }) => {
      const r = checkExtraWindow(w, day);
      assert.ok(r.ok, r.ok ? "" : r.error);
      return r.warnings.map((x) => `${x.code}: ${x.message} ${x.detail}`);
    };
    const leave = dayWindows(
      weekRows,
      [override(OverrideType.EMERGENCY_LEAVE, WED, { reason: "Conference" })],
      parseLocalDate(WED),
    );
    assert.deepEqual(codes(leave), ["leave: Doctor is on leave this day. Conference"]);
    const block = dayWindows(
      weekRows,
      [override(OverrideType.BLOCK_SLOT, WED, { startTime: "18:00", endTime: "19:00", reason: "Surgery" })],
      parseLocalDate(WED),
    );
    assert.deepEqual(codes(block, { start: "18:30", end: "19:30" }), [
      "blocked: This time is blocked on the doctor's calendar. Blocked 6:00 PM–7:00 PM · Surgery",
    ]);
    assert.deepEqual(codes(dayWindows(weekRows, [], parseLocalDate(THU))), [
      "offDay: Doctor is off duty on Thursdays. No regular hours that day",
    ]);
    assert.deepEqual(codes(dayWindows([], [], parseLocalDate(THU))), [], "no schedule at all → nothing to clash with");

    // Confirmed extra time on a leave day is bookable; regular hours stay closed.
    const slots = timeSlotsForProviderDay(
      weekRows,
      parseLocalDate(WED),
      [],
      [
        override(OverrideType.EMERGENCY_LEAVE, WED),
        override(OverrideType.EXTRA_SLOT, WED, { id: "x", startTime: "17:00", endTime: "18:00" }),
      ],
      Date.parse("2026-09-01T00:00:00Z"),
    );
    const at = (hhmmUtc: string) => slots.find((s) => s.start.toISOString().slice(11, 16) === hhmmUtc);
    assert.equal(at("04:30")?.available, false, "10:00 regular slot blocked by leave");
    assert.equal(at("11:30")?.available, true, "17:00 extra slot bookable");
  });

  test("rejects overlap with hours or extra slots, short, past or token-queue windows", () => {
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
    assert.deepEqual(checkExtraWindow({ start: "15:00", end: "16:00" }, d, 15 * 60 + 5), {
      ok: true,
      slots: 2,
      warnings: [],
    });
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

  test("slot options: length in 5-min steps, 1–20 patients, 1 patient stored as default", () => {
    assert.deepEqual(parseSlotOptions({}), { slotIntervalMin: null, capacity: null });
    assert.deepEqual(parseSlotOptions({ slotIntervalMin: "15", capacity: 3 }), { slotIntervalMin: 15, capacity: 3 });
    assert.deepEqual(parseSlotOptions({ capacity: 1 }), { slotIntervalMin: null, capacity: null });
    assert.ok("error" in parseSlotOptions({ slotIntervalMin: 12 }));
    assert.ok("error" in parseSlotOptions({ slotIntervalMin: 0 }));
    assert.ok("error" in parseSlotOptions({ capacity: 21 }));
    assert.ok("error" in parseSlotOptions({ capacity: 1.5 }));
  });

  test("an extra window can use its own slot length and be a shared queue slot", () => {
    const d = dayWindows(weekRows, [], parseLocalDate(WED));
    assert.deepEqual(checkExtraWindow({ start: "17:00", end: "18:00" }, d, undefined, 15), {
      ok: true,
      slots: 4,
      warnings: [],
    });
    const short = checkExtraWindow({ start: "17:00", end: "17:10" }, d, undefined, 15);
    assert.ok(!short.ok && short.code === "short" && /at least 15 minutes/.test(short.error));

    const stored = new Date("2026-11-04T00:00:00.000Z");
    const nov5 = parseLocalDate("2026-11-05");
    const queue = override(OverrideType.EXTRA_SLOT, "2026-11-05", {
      date: stored,
      startTime: "17:00",
      endTime: "18:00",
      slotIntervalMin: 15,
      capacity: 3,
    });
    const past = Date.parse("2026-10-01T00:00:00Z");
    const at5 = (n: number) =>
      Array.from({ length: n }, () => ({
        mode: ScheduleMode.TIME_BASED,
        status: BookingStatus.ACCEPTED,
        slotStart: new Date("2026-11-05T11:30:00.000Z"),
        slotEnd: new Date("2026-11-05T11:45:00.000Z"),
      })) as unknown as PracticeBooking[];
    const two = generateExtraSlotsFromOverrides([queue], nov5, at5(2), 20, 1, past);
    assert.equal(two.length, 4);
    assert.deepEqual(
      { capacity: two[0].capacity, booked: two[0].booked, available: two[0].available },
      { capacity: 3, booked: 2, available: true },
    );
    const full = generateExtraSlotsFromOverrides([queue], nov5, at5(3), 20, 1, past);
    assert.equal(full[0].available, false);
    assert.equal(full[1].available, true);
  });

  test("repeat plan: chosen weekdays until the end date, skipping clashes and warning on leave", () => {
    const newVersion = row(3, {
      id: "v2",
      endTime: "18:00",
      effectiveFrom: new Date("2026-11-18T00:00:00.000Z"),
    });
    const plan = planExtraSlots({
      from: "2026-11-04",
      repeat: { weekdays: [3], until: "2026-11-25" },
      window: { start: "17:00", end: "18:00" },
      rows: [...weekRows, newVersion],
      // Leave on Wed 11 Nov, as read back from the DATE column.
      overrides: [override(OverrideType.EMERGENCY_LEAVE, "2026-11-11", { date: new Date("2026-11-10T00:00:00.000Z") })],
      today: "2026-11-01",
      nowMin: 0,
    });
    assert.deepEqual(
      plan.dates.map((d) => [d.date, d.slots, d.warnings.map((w) => w.code)]),
      [
        ["2026-11-04", 3, []],
        ["2026-11-11", 3, ["leave"]],
      ],
    );
    assert.deepEqual(
      plan.skipped.map((s) => [s.date, s.reason]),
      [
        ["2026-11-18", "overlaps regular hours"],
        ["2026-11-25", "overlaps regular hours"],
      ],
    );

    const single = planExtraSlots({
      from: "2026-11-05",
      window: { start: "17:00", end: "18:00" },
      slotIntervalMin: 30,
      rows: weekRows,
      overrides: [],
      today: "2026-11-01",
      nowMin: 0,
    });
    assert.deepEqual(single.skipped, []);
    assert.deepEqual(
      single.dates.map((d) => [d.date, d.slots, d.slotIntervalMin, d.warnings.map((w) => w.code)]),
      [["2026-11-05", 2, 30, ["offDay"]]],
    );
  });

  test("MANAGE_SLOTS_INLINE: desk roles for any doctor, a doctor only for themselves", () => {
    assert.equal(permissionScope("RECEPTIONIST", "MANAGE_SLOTS_INLINE"), "ANY");
    assert.equal(permissionScope("PRACTICE_OWNER", "MANAGE_SLOTS_INLINE"), "ANY");
    assert.equal(permissionScope("PRACTICE_ADMIN", "MANAGE_SLOTS_INLINE"), "ANY");
    assert.equal(permissionScope("DOCTOR", "MANAGE_SLOTS_INLINE"), "OWN");
    assert.equal(permissionScope("PATIENT", "MANAGE_SLOTS_INLINE"), null);
    assert.equal(deniedFor("RECEPTIONIST", "MANAGE_SLOTS_INLINE", "desk", "dr-a"), null);
    assert.equal(deniedFor("DOCTOR", "MANAGE_SLOTS_INLINE", "dr-a", "dr-a"), null);
    assert.match(deniedFor("DOCTOR", "MANAGE_SLOTS_INLINE", "dr-a", "dr-b") ?? "", /only change your own calendar/);
    assert.match(deniedFor("PATIENT", "MANAGE_SLOTS_INLINE", "x", "dr-a") ?? "", /needs MANAGE_SLOTS_INLINE/);
    assert.deepEqual(permissionsFor("DOCTOR"), { MANAGE_SLOTS_INLINE: "OWN" });
  });

  test("hm12 formats clinic times", () => {
    assert.equal(hm12("00:05"), "12:05 AM");
    assert.equal(hm12("12:00"), "12:00 PM");
    assert.equal(hm12("17:40"), "5:40 PM");
  });
});
