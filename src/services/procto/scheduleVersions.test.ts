import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingStatus, ScheduleMode, type ProviderSchedule } from "@prisma/client";
import {
  applyNoticePeriod,
  assessBooking,
  autoMatchSlots,
  bookingFitsSchedule,
  dbDate,
  earliestSafeDate,
  findConflicts,
  localDayOfSessionDate,
  noticeEndsAt,
  normalizeNoticeHours,
  pickEffectiveVersion,
  rankSuggestions,
  summarizeImpact,
  upcomingVersionKeys,
} from "./scheduleVersions.js";
import {
  countBookingsOccupying,
  generateTimeSlots,
  parseLocalDate,
  zonedDateTime,
} from "./slotEngine.js";
import { PracticeService } from "./practice.service.js";
import { alertIsDue } from "./scheduleAlerts.service.js";

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
    assert.equal(c?.code, "DAY_OFF");
    assert.equal(c?.reason, "Monday is no longer a working day");
  });
  test("safe date is the day after the last conflict", () => {
    const conflicts = findConflicts(bookings, baseline, next, "2026-10-01");
    assert.equal(earliestSafeDate(conflicts, "2026-10-01"), "2026-10-13");
    assert.equal(earliestSafeDate([], "2026-10-01"), "2026-10-01");
    assert.equal(earliestSafeDate(conflicts, "2026-11-01"), "2026-11-01");
  });
});

describe("impact assessment reasons", () => {
  const mon = (hhmm: string) => timeBooking("x", "2026-10-05", hhmm);
  const tokenRow = (over: Partial<ProviderSchedule> = {}) =>
    row(1, "2026-10-01", {
      mode: ScheduleMode.TOKEN_BASED,
      startTime: null,
      endTime: null,
      slotIntervalMin: null,
      sessionStart: "10:00",
      sessionEnd: "14:00",
      maxTokens: 20,
      ...over,
    });

  test("fits → no impact", () => {
    assert.equal(assessBooking(mon("10:20"), baseline), null);
  });
  test("newly disabled working day", () => {
    const a = assessBooking(mon("10:20"), [row(3, "2026-10-01")]);
    assert.equal(a?.code, "DAY_OFF");
    assert.match(a!.reason, /Monday is no longer a working day/);
  });
  test("outside the new working hours", () => {
    const a = assessBooking(mon("10:20"), [row(1, "2026-10-01", { startTime: "11:00" })]);
    assert.equal(a?.code, "OUTSIDE_HOURS");
    assert.match(a!.reason, /10:20 AM is outside the new hours 11:00–14:00/);
    assert.equal(
      assessBooking(mon("13:40"), [row(1, "2026-10-01", { endTime: "13:50" })])?.code,
      "OUTSIDE_HOURS",
    );
  });
  test("inside a newly introduced break", () => {
    const a = assessBooking(
      mon("12:20"),
      [row(1, "2026-10-01", { breakStartTime: "12:00", breakEndTime: "13:00" })],
    );
    assert.equal(a?.code, "IN_BREAK");
    assert.match(a!.reason, /falls in the new break 12:00–13:00/);
  });
  test("slot interval change that no longer lines up", () => {
    const a = assessBooking(mon("10:20"), [row(1, "2026-10-01", { slotIntervalMin: 15 })]);
    assert.equal(a?.code, "OFF_GRID");
    assert.match(a!.reason, /new 15-min slots \(nearest 10:15 \/ 10:30\)/);
    assert.equal(assessBooking(mon("10:40"), [row(1, "2026-10-01", { slotIntervalMin: 40 })]), null);
  });
  test("booking type switched", () => {
    assert.equal(assessBooking(mon("10:20"), [tokenRow()])?.code, "MODE_CHANGED");
  });
  test("token above the new daily cap", () => {
    const token = {
      mode: ScheduleMode.TOKEN_BASED,
      slotStart: null,
      sessionDate: new Date(`${parseLocalDate("2026-10-05").toISOString().slice(0, 10)}T00:00:00Z`),
      tokenNumber: 25,
    };
    const a = assessBooking(token, [tokenRow()]);
    assert.equal(a?.code, "OVER_CAPACITY");
    assert.equal(assessBooking({ ...token, tokenNumber: 5 }, [tokenRow()]), null);
  });
  test("summary counts by reason and day", () => {
    const next = [row(1, "2026-10-01", { endTime: "12:00", breakStartTime: "10:40", breakEndTime: "11:00" })];
    const conflicts = findConflicts(
      [
        timeBooking("a", "2026-10-05", "13:00"),
        timeBooking("b", "2026-10-05", "10:40"),
        timeBooking("c", "2026-10-12", "12:40"),
      ],
      baseline,
      next,
      "2026-10-01",
    );
    const s = summarizeImpact(conflicts);
    assert.equal(s.total, 3);
    assert.equal(s.days, 2);
    assert.deepEqual(s.byCode, { OUTSIDE_HOURS: 2, IN_BREAK: 1 });
    assert.equal(s.firstDay, "2026-10-05");
    assert.equal(s.lastDay, "2026-10-12");
  });
});

describe("conflict resolution", () => {
  test("override-slot bookings are never flagged", () => {
    const next = [row(1, "2026-10-01", { startTime: "11:00" })];
    const kept = { ...timeBooking("k", "2026-10-05", "10:20"), overrideSlot: true };
    const open = timeBooking("o", "2026-10-05", "10:40");
    const conflicts = findConflicts([kept, open], baseline, next, "2026-10-01");
    assert.deepEqual(conflicts.map((c) => c.bookingId), ["o"]);
  });

  test("suggestions rank same day nearest time first, then nearby days (later wins a tie)", () => {
    const c = (day: string, minute: number) => ({ day, minute });
    const ranked = rankSuggestions("2026-10-05", 620, [
      c("2026-10-06", 620),
      c("2026-10-05", 700),
      c("2026-10-04", 620),
      c("2026-10-05", 640),
    ]);
    assert.deepEqual(ranked, [
      c("2026-10-05", 640),
      c("2026-10-05", 700),
      c("2026-10-06", 620),
      c("2026-10-04", 620),
    ]);
  });

  test("auto-match never gives two visits the same time slot; token sessions share capacity", () => {
    const slot = (key: string, capacity = 1) => ({ key, capacity });
    const a = slot("T 10:40");
    const b = slot("T 11:00");
    const tok = slot("K day", 2);
    const m = autoMatchSlots([
      { bookingId: "1", ranked: [a, b] },
      { bookingId: "2", ranked: [a, b] },
      { bookingId: "3", ranked: [a, b] },
      { bookingId: "4", ranked: [tok] },
      { bookingId: "5", ranked: [tok] },
      { bookingId: "6", ranked: [tok] },
    ]);
    assert.equal(m.get("1"), a);
    assert.equal(m.get("2"), b);
    assert.equal(m.get("3"), null);
    assert.equal(m.get("4"), tok);
    assert.equal(m.get("5"), tok);
    assert.equal(m.get("6"), null);
  });

  test("a kept off-grid visit blocks the grid slots it overlaps, not the next free one", () => {
    const day = "2026-10-05";
    const kept = {
      ...timeBooking("k", day, "10:20"),
      slotEnd: zonedDateTime(day, "10:40"),
    };
    const grid = row(1, "2026-10-01", { slotIntervalMin: 15 });
    const slots = generateTimeSlots(grid, parseLocalDate(day), [kept as never], [], 0);
    const at = (hhmm: string) =>
      slots.find((s) => s.start.getTime() === zonedDateTime(day, hhmm).getTime());
    assert.equal(at("10:15")?.available, false);
    assert.equal(at("10:30")?.available, false);
    assert.equal(at("10:00")?.available, true);
    assert.equal(at("10:45")?.available, true);
    assert.equal(
      countBookingsOccupying([kept], zonedDateTime(day, "10:40"), zonedDateTime(day, "11:00")),
      0,
    );
  });
});

describe("notice period", () => {
  const next = [row(1, "2026-10-01", { startTime: "11:00" })];
  const visits = [timeBooking("a", "2026-10-05", "10:20"), timeBooking("b", "2026-10-12", "10:20")];
  const conflicts = findConflicts(visits, baseline, next, "2026-10-01");
  const now = zonedDateTime("2026-10-03", "10:00");

  test("a change can't touch a booked visit inside the notice window — it starts the day after", () => {
    const r = applyNoticePeriod(conflicts, "2026-10-01", noticeEndsAt(72, now));
    assert.equal(r.effectiveFrom, "2026-10-06");
    assert.deepEqual(r.blockedBy.map((c) => c.bookingId), ["a"]);
  });
  test("visits outside the window, or no affected visits, keep the requested date", () => {
    assert.equal(applyNoticePeriod(conflicts, "2026-10-01", noticeEndsAt(24, now)).effectiveFrom, "2026-10-01");
    assert.equal(applyNoticePeriod([], "2026-10-01", noticeEndsAt(168, now)).effectiveFrom, "2026-10-01");
    assert.equal(applyNoticePeriod(conflicts, "2026-10-06", noticeEndsAt(72, now)).effectiveFrom, "2026-10-06");
  });
  test("7-day notice pushes past every visit in the week", () => {
    const r = applyNoticePeriod(conflicts, "2026-10-01", noticeEndsAt(168, zonedDateTime("2026-10-05", "11:00")));
    assert.equal(r.effectiveFrom, "2026-10-13");
  });
  test("only the allowed notice periods are accepted", () => {
    assert.equal(normalizeNoticeHours(168), 168);
    assert.equal(normalizeNoticeHours(5), 48);
    assert.equal(normalizeNoticeHours(undefined), 48);
  });
  test("held alerts are released when the visit gets close or after a day", () => {
    const createdAt = now;
    const inDays = (d: number) => new Date(now.getTime() + d * 24 * 3600 * 1000);
    assert.equal(alertIsDue({ createdAt }, inDays(10), 48, now), false);
    assert.equal(alertIsDue({ createdAt }, inDays(2.5), 48, now), true);
    assert.equal(alertIsDue({ createdAt }, inDays(10), 48, inDays(1.05)), true);
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
