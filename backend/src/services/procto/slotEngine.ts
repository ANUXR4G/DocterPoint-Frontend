import {
  BookingStatus,
  OverrideType,
  ScheduleMode,
  type ProviderSchedule,
  type ScheduleOverride,
  type PracticeBooking,
} from "@prisma/client";

/**
 * Clinic wall-clock timezone. Schedule HH:MM and WhatsApp/dashboard times
 * must agree — never rely on the server process TZ (Railway is often UTC).
 */
export const PRACTICE_TIMEZONE =
  process.env.PRACTICE_TIMEZONE?.trim() || "Asia/Kolkata";

export interface TimeSlot {
  start: Date;
  end: Date;
  booked: number;
  capacity: number;
  available: boolean;
}

export interface TokenSession {
  date: Date;
  sessionStart: string;
  sessionEnd: string;
  issued: number;
  capacity: number;
  nextToken: number;
  available: boolean;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone = PRACTICE_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Interpret YYYY-MM-DD + HH:MM as a wall-clock time in PRACTICE_TIMEZONE
 * and return the corresponding UTC Date.
 */
export function zonedDateTime(
  dateStr: string,
  timeHHMM: string,
  timeZone = PRACTICE_TIMEZONE,
): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeHHMM.split(":").map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) {
    return new Date(NaN);
  }
  // Guess = treat wall clock as UTC, then correct by the zone offset at that instant.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi ?? 0, 0, 0);
  const asZoned = zonedParts(new Date(utcGuess), timeZone);
  const asIfUtc = Date.UTC(
    asZoned.year,
    asZoned.month - 1,
    asZoned.day,
    asZoned.hour,
    asZoned.minute,
    asZoned.second,
  );
  return new Date(utcGuess - (asIfUtc - utcGuess));
}

/** Format an instant in the practice timezone (12-hour clock by default). */
export function formatPracticeDateTime(
  date: Date,
  opts?: { withDate?: boolean; withSeconds?: boolean },
): string {
  const withDate = opts?.withDate !== false;
  return date.toLocaleString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    ...(withDate
      ? { month: "numeric", day: "numeric", year: "numeric" }
      : {}),
    hour: "numeric",
    minute: "2-digit",
    ...(opts?.withSeconds ? { second: "2-digit" } : {}),
    hour12: true,
  });
}

export function formatPracticeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function parseTimeOnDate(date: Date, timeStr: string): Date {
  return zonedDateTime(formatLocalDate(date), timeStr);
}

/** Parse YYYY-MM-DD as clinic calendar day (midnight in PRACTICE_TIMEZONE). */
export function parseLocalDate(dateStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!y || !mo || !d) return new Date(dateStr);
  return zonedDateTime(
    `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    "00:00",
  );
}

export function startOfLocalDay(date: Date): Date {
  return zonedDateTime(formatLocalDate(date), "00:00");
}

export function endOfLocalDay(date: Date): Date {
  // Asia/Kolkata has no DST — 24h window from clinic midnight is safe.
  return new Date(startOfLocalDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function formatLocalDate(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function minutesOf(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return Number.NaN;
  return h * 60 + min;
}

export function formatHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function assertValidTimeRange(
  start: string,
  end: string,
  label = "time",
): { startMin: number; endMin: number } {
  const startMin = minutesOf(start);
  const endMin = minutesOf(end);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
    throw new Error(`invalid ${label} format (use HH:MM)`);
  }
  if (endMin <= startMin) {
    throw new Error(`${label} end must be after start`);
  }
  return { startMin, endMin };
}

/** Match slots by clinic wall-clock minute (avoids ISO/UTC equality bugs). */
export function sameLocalSlot(a: Date, b: Date): boolean {
  const pa = zonedParts(a);
  const pb = zonedParts(b);
  return (
    pa.year === pb.year &&
    pa.month === pb.month &&
    pa.day === pb.day &&
    pa.hour === pb.hour &&
    pa.minute === pb.minute
  );
}

/** Inclusive bookable window: today .. today + (validityDays - 1). */
export function getValidityBounds(appointmentValidityDays: number): {
  today: Date;
  maxDay: Date;
  days: number;
} {
  const days = Math.min(90, Math.max(1, appointmentValidityDays || 7));
  const today = startOfLocalDay(new Date());
  const maxDay = endOfLocalDay(new Date(today));
  maxDay.setDate(maxDay.getDate() + days - 1);
  return { today, maxDay, days };
}

export function isDateWithinValidity(
  date: Date,
  appointmentValidityDays: number,
): boolean {
  const { today, maxDay } = getValidityBounds(appointmentValidityDays);
  const day = startOfLocalDay(date);
  return day >= today && day <= maxDay;
}

function sameDay(a: Date, b: Date): boolean {
  const pa = zonedParts(a);
  const pb = zonedParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function overlapsBreak(
  schedule: ProviderSchedule,
  slotStart: Date,
  slotEnd: Date,
): boolean {
  if (!schedule.breakStartTime || !schedule.breakEndTime) return false;
  const breakStart = parseTimeOnDate(slotStart, schedule.breakStartTime);
  const breakEnd = parseTimeOnDate(slotStart, schedule.breakEndTime);
  return slotStart < breakEnd && slotEnd > breakStart;
}

function isBlockedByOverride(
  overrides: ScheduleOverride[],
  slotStart: Date,
  slotEnd: Date,
): boolean {
  return overrides.some((o) => {
    if (o.type === OverrideType.BLOCK_DAY || o.type === OverrideType.EMERGENCY_LEAVE) {
      return sameDay(o.date, slotStart);
    }
    if (o.type === OverrideType.BLOCK_SLOT && o.startTime && o.endTime) {
      const blockStart = parseTimeOnDate(slotStart, o.startTime);
      const blockEnd = parseTimeOnDate(slotStart, o.endTime);
      return slotStart < blockEnd && slotEnd > blockStart;
    }
    return false;
  });
}

export function generateTimeSlots(
  schedule: ProviderSchedule,
  date: Date,
  bookings: PracticeBooking[],
  overrides: ScheduleOverride[] = [],
): TimeSlot[] {
  if (schedule.mode !== ScheduleMode.TIME_BASED || !schedule.startTime || !schedule.endTime) {
    return [];
  }

  const interval = schedule.slotIntervalMin ?? 30;
  const capacity = Math.max(1, schedule.maxPerSlot ?? 1);
  const dayStart = parseTimeOnDate(date, schedule.startTime);
  const dayEnd = parseTimeOnDate(date, schedule.endTime);
  const now = Date.now();
  const slots: TimeSlot[] = [];

  let cursor = new Date(dayStart);
  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + interval * 60_000);
    if (slotEnd > dayEnd) break;

    // Skip break interval and overrides; past slots are not bookable
    const inBreak = overlapsBreak(schedule, cursor, slotEnd);
    const blocked = isBlockedByOverride(overrides, cursor, slotEnd);
    const isPast = cursor.getTime() <= now;

    const booked = bookings.filter(
      (b) =>
        b.mode === ScheduleMode.TIME_BASED &&
        b.status !== BookingStatus.CANCELED &&
        b.status !== BookingStatus.NO_SHOW &&
        b.slotStart &&
        sameLocalSlot(b.slotStart, cursor),
    ).length;

    const available = !inBreak && !blocked && !isPast && booked < capacity;

    // Omit break windows entirely so UI doesn't show dead slots
    if (!inBreak) {
      slots.push({
        start: new Date(cursor),
        end: slotEnd,
        booked,
        capacity,
        available,
      });
    }

    cursor = slotEnd;
  }

  return slots;
}

/** Admin-added bookable windows on a specific date (outside regular hours or on off days). */
export function generateExtraSlotsFromOverrides(
  overrides: ScheduleOverride[],
  date: Date,
  bookings: PracticeBooking[],
  slotIntervalMin: number,
  maxPerSlot: number,
): TimeSlot[] {
  const interval = Math.max(5, slotIntervalMin || 15);
  const now = Date.now();
  const slots: TimeSlot[] = [];

  for (const override of overrides) {
    if (
      override.type !== OverrideType.EXTRA_SLOT ||
      !override.startTime ||
      !override.endTime ||
      !sameDay(override.date, date)
    ) {
      continue;
    }

    const capacity = Math.max(1, override.maxTokens ?? maxPerSlot);
    const windowStart = parseTimeOnDate(date, override.startTime);
    const windowEnd = parseTimeOnDate(date, override.endTime);

    let cursor = new Date(windowStart);
    while (cursor < windowEnd) {
      const slotEnd = new Date(cursor.getTime() + interval * 60_000);
      if (slotEnd > windowEnd) break;

      const booked = bookings.filter(
        (b) =>
          b.mode === ScheduleMode.TIME_BASED &&
          b.status !== BookingStatus.CANCELED &&
          b.status !== BookingStatus.NO_SHOW &&
          b.slotStart &&
          sameLocalSlot(b.slotStart, cursor),
      ).length;

      slots.push({
        start: new Date(cursor),
        end: slotEnd,
        booked,
        capacity,
        available: cursor.getTime() > now && booked < capacity,
      });

      cursor = slotEnd;
    }
  }

  return slots;
}

/** Weekday 0=Sun … 6=Sat in PRACTICE_TIMEZONE. */
export function practiceWeekday(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? 0;
}

function slotStartKey(slot: TimeSlot): string {
  const p = zonedParts(slot.start);
  return `${p.year}-${p.month}-${p.day}-${p.hour}:${p.minute}`;
}

export function mergeTimeSlots(base: TimeSlot[], extra: TimeSlot[]): TimeSlot[] {
  const merged = new Map<string, TimeSlot>();
  for (const slot of [...base, ...extra]) {
    const key = slotStartKey(slot);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, slot);
      continue;
    }
    merged.set(key, {
      ...existing,
      capacity: Math.max(existing.capacity, slot.capacity),
      available: existing.available || slot.available,
      booked: Math.max(existing.booked, slot.booked),
    });
  }
  return [...merged.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function timeSlotsForProviderDay(
  schedules: ProviderSchedule[],
  date: Date,
  bookings: PracticeBooking[],
  overrides: ScheduleOverride[] = [],
): TimeSlot[] {
  const activeSchedules = schedulesForActiveMode(schedules);
  const daySchedules = activeSchedules.filter(
    (s) => s.dayOfWeek === practiceWeekday(date) && s.mode === ScheduleMode.TIME_BASED,
  );
  const template = activeSchedules.find((s) => s.mode === ScheduleMode.TIME_BASED);
  const interval = daySchedules[0]?.slotIntervalMin ?? template?.slotIntervalMin ?? 15;
  const maxPerSlot = daySchedules[0]?.maxPerSlot ?? template?.maxPerSlot ?? 1;

  const base = daySchedules.flatMap((s) =>
    generateTimeSlots(s, date, bookings, overrides),
  );
  const extra = generateExtraSlotsFromOverrides(
    overrides,
    date,
    bookings,
    interval,
    maxPerSlot,
  );
  return mergeTimeSlots(base, extra);
}

export function hasExtraSlotsForDay(
  overrides: ScheduleOverride[],
  date: Date,
): boolean {
  return overrides.some(
    (o) =>
      o.type === OverrideType.EXTRA_SLOT &&
      o.startTime &&
      o.endTime &&
      sameDay(o.date, date),
  );
}

export function getTokenSession(
  schedule: ProviderSchedule,
  date: Date,
  bookings: PracticeBooking[],
  overrides: ScheduleOverride[] = [],
): TokenSession | null {
  if (schedule.mode !== ScheduleMode.TOKEN_BASED || !schedule.sessionStart || !schedule.sessionEnd) {
    return null;
  }

  const dayBlocked = overrides.some(
    (o) =>
      sameDay(o.date, date) &&
      (o.type === OverrideType.BLOCK_DAY || o.type === OverrideType.EMERGENCY_LEAVE),
  );
  if (dayBlocked) return null;

  const tokenOverride = overrides.find(
    (o) => sameDay(o.date, date) && o.type === OverrideType.TOKEN_LIMIT_ADJUST && o.maxTokens,
  );
  const capacity = tokenOverride?.maxTokens ?? schedule.maxTokens ?? 50;

  const sessionBookings = bookings.filter(
    (b) =>
      b.mode === ScheduleMode.TOKEN_BASED &&
      b.status !== BookingStatus.CANCELED &&
      b.status !== BookingStatus.NO_SHOW &&
      b.sessionDate &&
      sameDay(b.sessionDate, date),
  );

  const issued = sessionBookings.length;
  const maxToken = sessionBookings.reduce((max, b) => Math.max(max, b.tokenNumber ?? 0), 0);

  // Past session end → not available
  const sessionEnd = parseTimeOnDate(date, schedule.sessionEnd);
  const sessionStillOpen = Date.now() < sessionEnd.getTime();

  return {
    date,
    sessionStart: schedule.sessionStart,
    sessionEnd: schedule.sessionEnd,
    issued,
    capacity,
    nextToken: maxToken + 1,
    available: sessionStillOpen && issued < capacity,
  };
}

export function assignNextToken(
  schedule: ProviderSchedule,
  date: Date,
  bookings: PracticeBooking[],
  overrides: ScheduleOverride[] = [],
): number | null {
  const session = getTokenSession(schedule, date, bookings, overrides);
  if (!session?.available) return null;
  return session.nextToken;
}

/** A provider uses time slots OR token queue — never both at once. */
export function resolveProviderBookingMode(
  schedules: Array<{ mode: ScheduleMode }>,
): ScheduleMode | null {
  if (!schedules.length) return null;
  const modes = [...new Set(schedules.map((s) => s.mode))];
  if (modes.length === 1) return modes[0]!;
  // Legacy mixed rows: prefer time slots until provider re-saves settings.
  return ScheduleMode.TIME_BASED;
}

export function schedulesForActiveMode<T extends { mode: ScheduleMode }>(
  schedules: T[],
): T[] {
  const mode = resolveProviderBookingMode(schedules);
  if (!mode) return [];
  return schedules.filter((s) => s.mode === mode);
}
