/**
 * Effective-dated schedule versions.
 *
 * `provider_schedules` rows sharing an `effective_from` form one weekly schedule
 * (a version). A clinic day uses the version with the latest `effective_from`
 * on or before it — so a saved change never rewrites days before its start,
 * and appointments already booked on those days keep the rules they were booked under.
 */
import {
  BookingStatus,
  ScheduleMode,
  ScheduleVersionStatus,
  type PracticeBooking,
  type ProviderSchedule,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  formatLocalDate,
  formatPracticeDateTime,
  formatPracticeTime,
  generateTimeSlots,
  minutesOf,
  parseLocalDate,
  PRACTICE_TIMEZONE,
  practiceWeekday,
  resolveProviderBookingMode,
  sameLocalSlot,
} from "./slotEngine.js";

export const BASELINE_EFFECTIVE_FROM = "2000-01-01";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rows the slot engine may use (pending-verification versions excluded). */
export const ACTIVE_VERSION = {
  isActive: true,
  status: ScheduleVersionStatus.ACTIVE,
} as const;

/** `effective_from` is stored as the plain calendar date (UTC midnight). */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDaysIso(iso: string, days: number): string {
  return dateKey(new Date(dbDate(iso).getTime() + days * DAY_MS));
}

export function todayIso(now: Date = new Date()): string {
  return formatLocalDate(now);
}

/**
 * Clinic day of a `session_date` / override `date` column, which is written as
 * clinic-local midnight (the UTC date portion, i.e. the previous day in IST).
 */
export function localDayOfSessionDate(d: Date): string {
  const stored = dateKey(d);
  for (const candidate of [stored, addDaysIso(stored, 1)]) {
    if (dateKey(parseLocalDate(candidate)) === stored) return candidate;
  }
  return stored;
}

type Versioned = { effectiveFrom: Date; locationId: string };

/** Rows of the version in force on `dayIso`, per location. */
export function pickEffectiveVersion<T extends Versioned>(rows: T[], dayIso: string): T[] {
  const latest = new Map<string, string>();
  for (const r of rows) {
    const key = dateKey(r.effectiveFrom);
    if (key > dayIso) continue;
    const current = latest.get(r.locationId);
    if (!current || key > current) latest.set(r.locationId, key);
  }
  return rows.filter((r) => latest.get(r.locationId) === dateKey(r.effectiveFrom));
}

/** Start dates of versions that begin after `dayIso`, oldest first. */
export function upcomingVersionKeys<T extends Versioned>(rows: T[], dayIso: string): string[] {
  return [...new Set(rows.map((r) => dateKey(r.effectiveFrom)).filter((k) => k > dayIso))].sort();
}

/** Schedule rows in force on a clinic day (all weekdays of that version). */
export async function loadSchedulesOn(
  where: { practiceId?: string; providerId: string; locationId?: string },
  dayIso: string,
): Promise<ProviderSchedule[]> {
  const rows = await prisma.providerSchedule.findMany({
    where: { ...where, ...ACTIVE_VERSION, effectiveFrom: { lte: dbDate(dayIso) } },
  });
  return pickEffectiveVersion(rows, dayIso);
}

export type ScheduleSummary = {
  effectiveFrom: string;
  mode: ScheduleMode | null;
  workingDays: number[];
  startTime: string | null;
  endTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  slotIntervalMin: number | null;
  maxPerSlot: number | null;
};

export function summarizeVersion(rows: ProviderSchedule[], effectiveFrom: string): ScheduleSummary {
  const first = rows[0];
  return {
    effectiveFrom,
    mode: resolveProviderBookingMode(rows),
    workingDays: [...new Set(rows.map((r) => r.dayOfWeek))].sort((a, b) => a - b),
    startTime: first ? (first.startTime ?? first.sessionStart) : null,
    endTime: first ? (first.endTime ?? first.sessionEnd) : null,
    breakStartTime: first?.breakStartTime ?? null,
    breakEndTime: first?.breakEndTime ?? null,
    slotIntervalMin: first?.slotIntervalMin ?? null,
    maxPerSlot: first?.maxPerSlot ?? null,
  };
}

type ScheduleShape = Pick<
  ProviderSchedule,
  | "dayOfWeek"
  | "mode"
  | "slotIntervalMin"
  | "startTime"
  | "endTime"
  | "sessionStart"
  | "sessionEnd"
  | "breakStartTime"
  | "breakEndTime"
  | "maxPerSlot"
  | "maxTokens"
>;

type BookingShape = Pick<PracticeBooking, "mode" | "slotStart" | "sessionDate"> &
  Partial<Pick<PracticeBooking, "tokenNumber">>;

/** Clinic day of a booking. */
export function bookingDayIso(b: BookingShape): string | null {
  if (b.slotStart) return formatLocalDate(b.slotStart);
  if (b.sessionDate) return localDayOfSessionDate(b.sessionDate);
  return null;
}

export type ConflictCode =
  | "MODE_CHANGED"
  | "DAY_OFF"
  | "OUTSIDE_HOURS"
  | "IN_BREAK"
  | "OFF_GRID"
  | "OVER_CAPACITY";

export type BookingAssessment = { code: ConflictCode; reason: string };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: PRACTICE_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes after clinic-local midnight. */
export function practiceMinuteOfDay(d: Date): number {
  const [h, m] = clockFmt.format(d).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * Impact of `schedule` (one weekly version) on a booking: null when the
 * version still offers it, else why not — mode switch, day off, outside the
 * new hours, inside a new break, off the new slot grid, or token over the new cap.
 */
export function assessBooking(b: BookingShape, schedule: ScheduleShape[]): BookingAssessment | null {
  const dayIso = bookingDayIso(b);
  if (!dayIso) return { code: "DAY_OFF", reason: "Booking has no date" };
  const day = parseLocalDate(dayIso);
  const weekday = practiceWeekday(day);
  const mode = resolveProviderBookingMode(schedule);
  if (mode && mode !== b.mode) {
    return {
      code: "MODE_CHANGED",
      reason:
        mode === ScheduleMode.TOKEN_BASED
          ? "Booked as a time slot; the new schedule uses a token queue"
          : "Booked as a token; the new schedule uses time slots",
    };
  }
  const rows = schedule.filter((s) => s.dayOfWeek === weekday && s.mode === b.mode);
  const dayOff = {
    code: "DAY_OFF" as const,
    reason: `${WEEKDAY_NAMES[weekday]} is no longer a working day`,
  };
  if (!rows.length) return dayOff;

  if (b.mode === ScheduleMode.TOKEN_BASED) {
    const row = rows.find((r) => r.sessionStart && r.sessionEnd);
    if (!row) return dayOff;
    if (row.maxTokens != null && b.tokenNumber != null && b.tokenNumber > row.maxTokens) {
      return {
        code: "OVER_CAPACITY",
        reason: `Token #${b.tokenNumber} is above the new daily limit of ${row.maxTokens}`,
      };
    }
    return null;
  }

  if (!b.slotStart) return dayOff;
  const fits = rows.some((r) =>
    generateTimeSlots(r as ProviderSchedule, day, [], [], 0).some(
      (slot) => slot.available && sameLocalSlot(slot.start, b.slotStart!),
    ),
  );
  if (fits) return null;

  const t = practiceMinuteOfDay(b.slotStart);
  const at = formatPracticeTime(b.slotStart);
  const r = rows.find((x) => x.startTime && x.endTime) ?? rows[0]!;
  const interval = r.slotIntervalMin ?? 30;
  const start = r.startTime ? minutesOf(r.startTime) : 0;
  const end = r.endTime ? minutesOf(r.endTime) : 0;
  if (!r.startTime || !r.endTime || t < start || t + interval > end) {
    return {
      code: "OUTSIDE_HOURS",
      reason: `${at} is outside the new hours ${r.startTime ?? "?"}–${r.endTime ?? "?"}`,
    };
  }
  if (r.breakStartTime && r.breakEndTime) {
    const bs = minutesOf(r.breakStartTime);
    const be = minutesOf(r.breakEndTime);
    if (t < be && t + interval > bs) {
      return {
        code: "IN_BREAK",
        reason: `${at} falls in the new break ${r.breakStartTime}–${r.breakEndTime}`,
      };
    }
  }
  const before = start + Math.floor((t - start) / interval) * interval;
  return {
    code: "OFF_GRID",
    reason: `${at} doesn't line up with the new ${interval}-min slots (nearest ${hhmm(before)} / ${hhmm(before + interval)})`,
  };
}

/**
 * Would this booking be offered by `schedule` (a weekly version)? Time bookings
 * must land on a slot start of the new grid outside the break; token bookings
 * need a token session that day within the token cap.
 */
export function bookingFitsSchedule(b: BookingShape, schedule: ScheduleShape[]): boolean {
  return assessBooking(b, schedule) === null;
}

export type ScheduleConflict = {
  bookingId: string;
  patientName: string | null;
  day: string;
  when: string;
  /** Slot start; token visits count from the start of their clinic day. */
  startsAt: string;
  code: ConflictCode;
  reason: string;
};

export const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
];

/**
 * Impact assessment: upcoming bookings that fit the schedule currently in force
 * on their day but would not fit `next`. They stay booked either way — this only
 * tells the clinic who needs a call / reschedule.
 */
export function findConflicts(
  bookings: Array<
    BookingShape &
      Pick<PracticeBooking, "id" | "patientName" | "locationId"> &
      Partial<Pick<PracticeBooking, "overrideSlot">>
  >,
  currentRows: Array<ProviderSchedule>,
  next: ScheduleShape[],
  fromIso: string,
): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const b of bookings) {
    if (b.overrideSlot) continue;
    const day = bookingDayIso(b);
    if (!day || day < fromIso) continue;
    const current = pickEffectiveVersion(
      currentRows.filter((r) => r.locationId === b.locationId),
      day,
    );
    if (!bookingFitsSchedule(b, current)) continue;
    const impact = assessBooking(b, next);
    if (!impact) continue;
    out.push({
      bookingId: b.id,
      patientName: b.patientName,
      day,
      when: b.slotStart
        ? formatPracticeDateTime(b.slotStart)
        : `${day} (token${b.tokenNumber != null ? ` #${b.tokenNumber}` : ""})`,
      startsAt: (b.slotStart ?? parseLocalDate(day)).toISOString(),
      code: impact.code,
      reason: impact.reason,
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.when.localeCompare(b.when));
}

export type ImpactSummary = {
  total: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  byCode: Partial<Record<ConflictCode, number>>;
};

export function summarizeImpact(conflicts: ScheduleConflict[]): ImpactSummary {
  const byCode: Partial<Record<ConflictCode, number>> = {};
  for (const c of conflicts) byCode[c.code] = (byCode[c.code] ?? 0) + 1;
  const days = [...new Set(conflicts.map((c) => c.day))].sort();
  return {
    total: conflicts.length,
    days: days.length,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    byCode,
  };
}

/** A free place a conflicting visit could move to under the schedule that will apply that day. */
export type SlotCandidate = {
  mode: ScheduleMode;
  day: string;
  /** Minutes after clinic midnight: slot start, or token session start. */
  minute: number;
  slotStart?: string;
  sessionDate?: string;
  label: string;
  /** Visits sharing a key compete for `capacity` places (1 per time slot, free tokens per session). */
  key: string;
  capacity: number;
};

function dayDistance(fromIso: string, toIso: string): number {
  return Math.round((dbDate(toIso).getTime() - dbDate(fromIso).getTime()) / DAY_MS);
}

/** Closest first: same day at the nearest time, then nearby days; a later day wins a tie. */
export function rankSuggestions<T extends Pick<SlotCandidate, "day" | "minute">>(
  originalDay: string,
  originalMinute: number,
  candidates: T[],
): T[] {
  const score = (c: T) => {
    const d = dayDistance(originalDay, c.day);
    return Math.abs(d) * 1440 + Math.abs(c.minute - originalMinute) + (d < 0 ? 0.5 : 0);
  };
  return candidates
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.c);
}

/**
 * Auto-match: in order, each visit takes its best-ranked candidate that earlier
 * visits have not already used up, so two patients are never offered one slot.
 */
export function autoMatchSlots<T extends Pick<SlotCandidate, "key" | "capacity">>(
  items: Array<{ bookingId: string; ranked: T[] }>,
): Map<string, T | null> {
  const used = new Map<string, number>();
  const out = new Map<string, T | null>();
  for (const item of items) {
    const pick = item.ranked.find((c) => (used.get(c.key) ?? 0) < c.capacity) ?? null;
    if (pick) used.set(pick.key, (used.get(pick.key) ?? 0) + 1);
    out.set(item.bookingId, pick);
  }
  return out;
}

export const NOTICE_HOURS_OPTIONS = [24, 48, 72, 168] as const;
export const DEFAULT_NOTICE_HOURS = 48;

export function normalizeNoticeHours(hours: number | null | undefined): number {
  return (NOTICE_HOURS_OPTIONS as readonly number[]).includes(Number(hours))
    ? Number(hours)
    : DEFAULT_NOTICE_HOURS;
}

/** End of the notice window: visits starting before this can't be affected by a schedule change. */
export function noticeEndsAt(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + normalizeNoticeHours(hours) * 60 * 60 * 1000);
}

export function noticeLabel(hours: number): string {
  return hours === 168 ? "7 days'" : `${hours} hours'`;
}

/**
 * Lead-time rule: a change starting `requestedIso` may not affect any booked
 * visit inside the notice window, so it starts the day after the last such
 * visit instead. `conflicts` are the clashes from `requestedIso` on.
 */
export function applyNoticePeriod(
  conflicts: ScheduleConflict[],
  requestedIso: string,
  endsAt: Date,
): { effectiveFrom: string; blockedBy: ScheduleConflict[] } {
  const blockedBy = conflicts.filter(
    (c) => c.day >= requestedIso && new Date(c.startsAt).getTime() < endsAt.getTime(),
  );
  if (!blockedBy.length) return { effectiveFrom: requestedIso, blockedBy };
  const lastDay = blockedBy.reduce((max, c) => (c.day > max ? c.day : max), requestedIso);
  return { effectiveFrom: addDaysIso(lastDay, 1), blockedBy };
}

/** First day on/after `minIso` with no conflicting booking on or after it. */
export function earliestSafeDate(conflicts: ScheduleConflict[], minIso: string): string {
  const last = conflicts.reduce<string | null>((max, c) => (!max || c.day > max ? c.day : max), null);
  if (!last) return minIso;
  const after = addDaysIso(last, 1);
  return after > minIso ? after : minIso;
}
