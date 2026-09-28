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
  type PracticeBooking,
  type ProviderSchedule,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  formatLocalDate,
  formatPracticeDateTime,
  generateTimeSlots,
  parseLocalDate,
  practiceWeekday,
  resolveProviderBookingMode,
  sameLocalSlot,
} from "./slotEngine.js";

export const BASELINE_EFFECTIVE_FROM = "2000-01-01";
const DAY_MS = 24 * 60 * 60 * 1000;

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
    where: { ...where, isActive: true, effectiveFrom: { lte: dbDate(dayIso) } },
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

type BookingShape = Pick<PracticeBooking, "mode" | "slotStart" | "sessionDate">;

/** Clinic day of a booking. */
export function bookingDayIso(b: BookingShape): string | null {
  if (b.slotStart) return formatLocalDate(b.slotStart);
  if (b.sessionDate) return localDayOfSessionDate(b.sessionDate);
  return null;
}

/**
 * Would this booking be offered by `schedule` (a weekly version)? Time bookings
 * must land on a slot start of the new grid outside the break; token bookings
 * need a token session that day.
 */
export function bookingFitsSchedule(b: BookingShape, schedule: ScheduleShape[]): boolean {
  const dayIso = bookingDayIso(b);
  if (!dayIso) return false;
  const day = parseLocalDate(dayIso);
  const weekday = practiceWeekday(day);
  const mode = resolveProviderBookingMode(schedule);
  if (!mode || mode !== b.mode) return false;
  const rows = schedule.filter((s) => s.dayOfWeek === weekday && s.mode === mode);
  if (!rows.length) return false;
  if (mode === ScheduleMode.TOKEN_BASED) return rows.some((r) => r.sessionStart && r.sessionEnd);
  if (!b.slotStart) return false;
  return rows.some((r) =>
    generateTimeSlots(r as ProviderSchedule, day, [], [], 0).some(
      (slot) => slot.available && sameLocalSlot(slot.start, b.slotStart!),
    ),
  );
}

export type ScheduleConflict = {
  bookingId: string;
  patientName: string | null;
  day: string;
  when: string;
  reason: string;
};

function conflictReason(
  b: BookingShape,
  next: ScheduleShape[],
): string {
  const nextMode = resolveProviderBookingMode(next);
  if (nextMode && nextMode !== b.mode) {
    return nextMode === ScheduleMode.TOKEN_BASED
      ? "Booked as a time slot; the new schedule uses a token queue"
      : "Booked as a token; the new schedule uses time slots";
  }
  const dayIso = bookingDayIso(b);
  const weekday = dayIso ? practiceWeekday(parseLocalDate(dayIso)) : -1;
  if (!next.some((s) => s.dayOfWeek === weekday)) return "Day is no longer a working day";
  return "Time is outside the new hours, in the break, or off the new slot grid";
}

export const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
];

/**
 * Upcoming bookings that fit the schedule currently in force on their day but
 * would not fit `next`. They stay booked either way — this only tells the
 * clinic who needs a call / reschedule.
 */
export function findConflicts(
  bookings: Array<BookingShape & Pick<PracticeBooking, "id" | "patientName" | "locationId">>,
  currentRows: Array<ProviderSchedule>,
  next: ScheduleShape[],
  fromIso: string,
): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const b of bookings) {
    const day = bookingDayIso(b);
    if (!day || day < fromIso) continue;
    const current = pickEffectiveVersion(
      currentRows.filter((r) => r.locationId === b.locationId),
      day,
    );
    if (!bookingFitsSchedule(b, current)) continue;
    if (bookingFitsSchedule(b, next)) continue;
    out.push({
      bookingId: b.id,
      patientName: b.patientName,
      day,
      when: b.slotStart
        ? formatPracticeDateTime(b.slotStart)
        : `${day} (token)`,
      reason: conflictReason(b, next),
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.when.localeCompare(b.when));
}

/** First day on/after `minIso` with no conflicting booking on or after it. */
export function earliestSafeDate(conflicts: ScheduleConflict[], minIso: string): string {
  const last = conflicts.reduce<string | null>((max, c) => (!max || c.day > max ? c.day : max), null);
  if (!last) return minIso;
  const after = addDaysIso(last, 1);
  return after > minIso ? after : minIso;
}
