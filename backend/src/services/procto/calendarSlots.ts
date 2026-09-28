import { OverrideType, ScheduleMode, type ProviderSchedule, type ScheduleOverride } from "@prisma/client";
import {
  formatHHMM,
  minutesOf,
  parseLocalDate,
  PRACTICE_TIMEZONE,
  practiceWeekday,
  schedulesForActiveMode,
  startOfLocalDay,
} from "./slotEngine.js";
import { addDaysIso, dateKey, pickEffectiveVersion } from "./scheduleVersions.js";

/** Owners, admins and reception work on any doctor's calendar; a doctor only on their own. */
export const DESK_ROLES = new Set(["PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"]);

/** Clinic wall-clock minutes past midnight (fractional). */
export function clinicMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute") + get("second") / 60;
}

export type TimeWindow = { start: string; end: string };

export type ExtraWindow = TimeWindow & {
  id: string;
  note: string | null;
  slotIntervalMin: number;
  /** Patients per slot (1 = normal slot, more = shared queue slot). */
  capacity: number;
  seriesId: string | null;
};

export type DayWindows = {
  /** Clinic weekday, 0 = Sunday. */
  weekday: number;
  /** Regular hours for the day, split around the break. */
  hours: TimeWindow[];
  /** The doctor's break inside regular hours. */
  breaks: TimeWindow[];
  /** Quick-created / admin extra bookable windows (EXTRA_SLOT overrides). */
  extra: ExtraWindow[];
  blocked: Array<TimeWindow & { type: string; reason: string | null }>;
  /** Whole day blocked (day off / emergency leave). */
  dayOff: { type: string; reason: string | null } | null;
  mode: ScheduleMode | null;
  slotIntervalMin: number;
};

/** "Priya Nair" → "Dr Priya Nair"; names already titled ("Dr. Priya") are kept. */
export function drName(name: string): string {
  const n = name.trim();
  return /^dr\b\.?/i.test(n) ? n : `Dr ${n}`;
}

/** "17:00" → "5:00 PM". */
export function hm12(hm: string): string {
  const min = minutesOf(hm);
  if (Number.isNaN(min)) return hm;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const range = (w: TimeWindow) => `${hm12(w.start)}–${hm12(w.end)}`;

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return minutesOf(a.start) < minutesOf(b.end) && minutesOf(a.end) > minutesOf(b.start);
}

/** Same interval the booking path uses: that weekday's row, else any time-based row, else 15. */
export function slotIntervalFor(activeRows: ProviderSchedule[], date: Date): number {
  const weekday = practiceWeekday(date);
  const timed = activeRows.filter((r) => r.mode === ScheduleMode.TIME_BASED);
  return timed.find((r) => r.dayOfWeek === weekday)?.slotIntervalMin ?? timed[0]?.slotIntervalMin ?? 15;
}

export function dayWindows(
  allRows: ProviderSchedule[],
  overrides: ScheduleOverride[],
  date: Date,
): DayWindows {
  const active = schedulesForActiveMode(allRows);
  const mode = active[0]?.mode ?? null;
  const weekday = practiceWeekday(date);
  const hours: TimeWindow[] = [];
  const breaks: TimeWindow[] = [];
  for (const r of active) {
    if (r.dayOfWeek !== weekday || r.mode !== ScheduleMode.TIME_BASED || !r.startTime || !r.endTime) continue;
    const s = minutesOf(r.startTime);
    const e = minutesOf(r.endTime);
    const bs = r.breakStartTime ? minutesOf(r.breakStartTime) : Number.NaN;
    const be = r.breakEndTime ? minutesOf(r.breakEndTime) : Number.NaN;
    if (!Number.isNaN(bs) && !Number.isNaN(be) && bs < be && bs < e && be > s) {
      if (bs > s) hours.push({ start: r.startTime, end: formatHHMM(bs) });
      if (be < e) hours.push({ start: formatHHMM(be), end: r.endTime });
      breaks.push({ start: formatHHMM(Math.max(bs, s)), end: formatHHMM(Math.min(be, e)) });
    } else {
      hours.push({ start: r.startTime, end: r.endTime });
    }
  }
  hours.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));

  const slotIntervalMin = slotIntervalFor(active, date);
  const extra: DayWindows["extra"] = [];
  const blocked: DayWindows["blocked"] = [];
  let dayOff: DayWindows["dayOff"] = null;
  for (const o of overrides) {
    if (o.type === OverrideType.EXTRA_SLOT && o.startTime && o.endTime) {
      extra.push({
        id: o.id,
        start: o.startTime,
        end: o.endTime,
        note: o.reason,
        slotIntervalMin: o.slotIntervalMin ?? slotIntervalMin,
        capacity: Math.max(1, o.capacity ?? 1),
        seriesId: o.seriesId ?? null,
      });
    } else if (o.type === OverrideType.BLOCK_SLOT && o.startTime && o.endTime) {
      blocked.push({ start: o.startTime, end: o.endTime, type: o.type, reason: o.reason });
    } else if (o.type === OverrideType.BLOCK_DAY || o.type === OverrideType.EMERGENCY_LEAVE) {
      dayOff = { type: o.type, reason: o.reason };
    }
  }
  extra.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));

  return { weekday, hours, breaks, extra, blocked, dayOff, mode, slotIntervalMin };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type WarningCode = "leave" | "offDay" | "break" | "blocked";

/** Non-blocking conflict: the slot can still be created after the user confirms. */
export type SlotWarning = { code: WarningCode; message: string; detail: string };

/** Break, blocked time, leave and non-working days the window runs into. */
export function slotWarnings(win: TimeWindow, day: DayWindows): SlotWarning[] {
  const out: SlotWarning[] = [];
  if (day.dayOff) {
    out.push({
      code: "leave",
      message: "Doctor is on leave this day.",
      detail: day.dayOff.reason?.trim() || (day.dayOff.type === OverrideType.EMERGENCY_LEAVE ? "Emergency leave" : "Day off"),
    });
  } else if (day.mode && !day.hours.length) {
    out.push({
      code: "offDay",
      message: `Doctor is off duty on ${WEEKDAY_NAMES[day.weekday]}s.`,
      detail: "No regular hours that day",
    });
  }
  const brk = day.breaks.find((b) => overlaps(win, b));
  if (brk) out.push({ code: "break", message: "Doctor is marked on break during this time.", detail: `Break ${range(brk)}` });
  const block = day.blocked.find((b) => overlaps(win, b));
  if (block) {
    out.push({
      code: "blocked",
      message: "This time is blocked on the doctor's calendar.",
      detail: `Blocked ${range(block)}${block.reason?.trim() ? ` · ${block.reason.trim()}` : ""}`,
    });
  }
  return out;
}

export const MAX_SLOT_CAPACITY = 20;
/** Longest "Extend · repeat" range and most days one request may create. */
export const MAX_REPEAT_SPAN_DAYS = 366;
export const MAX_REPEAT_DAYS = 120;

/** Slot length (5–240 min, steps of 5) and patients per slot (1–20); null = the doctor's default. */
export function parseSlotOptions(raw: {
  slotIntervalMin?: unknown;
  capacity?: unknown;
}): { slotIntervalMin: number | null; capacity: number | null } | { error: string } {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const interval = num(raw.slotIntervalMin);
  if (interval != null && (!Number.isInteger(interval) || interval < 5 || interval > 240 || interval % 5)) {
    return { error: "Slot length must be 5–240 minutes, in steps of 5." };
  }
  const capacity = num(raw.capacity);
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SLOT_CAPACITY)) {
    return { error: `Patients per slot must be 1–${MAX_SLOT_CAPACITY}.` };
  }
  return { slotIntervalMin: interval, capacity: capacity === 1 ? null : capacity };
}

/** Hard conflicts — the day can't take the window. Break / blocked / leave are warnings instead. */
export type SkipCode = "format" | "order" | "token" | "short" | "hours" | "extra" | "past";

/** Short label for a skipped day in a repeat range. */
export const SKIP_LABEL: Record<SkipCode, string> = {
  format: "invalid time",
  order: "invalid time",
  token: "token queue day",
  short: "shorter than one slot",
  hours: "overlaps regular hours",
  extra: "already has extra slots",
  past: "already passed",
};

/** Short label for a warned day in a repeat range. */
export const WARNING_LABEL: Record<WarningCode, string> = {
  leave: "on leave",
  offDay: "off duty",
  break: "break time",
  blocked: "blocked time",
};

/**
 * Validate a quick-create window against the doctor's day. `nowMin` = clinic minutes
 * past midnight when the day is today (slot starts must be strictly after it).
 */
export function checkExtraWindow(
  win: TimeWindow,
  day: DayWindows,
  nowMin?: number,
  slotIntervalMin?: number | null,
):
  | { ok: true; slots: number; warnings: SlotWarning[] }
  | { ok: false; error: string; code: SkipCode } {
  const fail = (code: SkipCode, error: string) => ({ ok: false as const, error, code });
  const s = minutesOf(win.start);
  const e = minutesOf(win.end);
  if (Number.isNaN(s) || Number.isNaN(e)) return fail("format", "Times must be HH:MM.");
  if (e <= s) return fail("order", "End time must be after the start time.");
  if (day.mode === ScheduleMode.TOKEN_BASED) {
    return fail("token", "This doctor uses a token queue — extra time slots only work for time-slot booking.");
  }
  const interval = slotIntervalMin || day.slotIntervalMin;
  if (e - s < interval) {
    return fail("short", `Pick at least ${interval} minutes — one slot is ${interval} minutes.`);
  }
  const hit = day.hours.find((h) => overlaps(win, h));
  if (hit) return fail("hours", `${range(win)} overlaps regular hours ${range(hit)}. Pick a time outside them.`);
  const extra = day.extra.find((x) => overlaps(win, x));
  if (extra) return fail("extra", `Extra slots already cover ${range(extra)}.`);

  let slots = 0;
  for (let t = s; t + interval <= e; t += interval) {
    if (nowMin == null || t > nowMin) slots++;
  }
  if (!slots) return fail("past", "That time has already passed. Pick a later time.");
  return { ok: true, slots, warnings: slotWarnings(win, day) };
}

/** Clinic weekday (0=Sun) of a YYYY-MM-DD calendar date. */
export function weekdayOfIso(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay();
}

export type RepeatRule = { weekdays: number[]; until: string };

export type ExtraSlotPlan = {
  dates: Array<{ date: string; slots: number; slotIntervalMin: number; warnings: SlotWarning[] }>;
  skipped: Array<{ date: string; code: SkipCode; reason: string; error: string }>;
};

/**
 * Days an extra window would be added on: just `from`, or every chosen weekday from
 * `from` to `repeat.until`. Each day is checked against the schedule version in force
 * that day and its overrides; days that don't fit are skipped with a reason.
 * `rows` = all ACTIVE schedule rows of the doctor; `overrides` = their overrides in range.
 */
export function planExtraSlots(input: {
  from: string;
  repeat?: RepeatRule | null;
  window: TimeWindow;
  slotIntervalMin?: number | null;
  rows: ProviderSchedule[];
  overrides: ScheduleOverride[];
  today: string;
  nowMin: number;
}): ExtraSlotPlan {
  const days: string[] = [];
  if (!input.repeat) days.push(input.from);
  else {
    const wanted = new Set(input.repeat.weekdays);
    for (let d = input.from; d <= input.repeat.until; d = addDaysIso(d, 1)) {
      if (wanted.has(weekdayOfIso(d))) days.push(d);
    }
  }

  const byDay = new Map<string, ScheduleOverride[]>();
  for (const o of input.overrides) {
    const k = dateKey(o.date);
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }

  const plan: ExtraSlotPlan = { dates: [], skipped: [] };
  for (const iso of days) {
    const date = parseLocalDate(iso);
    const day = dayWindows(
      pickEffectiveVersion(input.rows, iso),
      byDay.get(dateKey(startOfLocalDay(date))) ?? [],
      date,
    );
    const check =
      iso < input.today
        ? ({ ok: false, code: "past", error: "That day has already passed." } as const)
        : checkExtraWindow(
            input.window,
            day,
            iso === input.today ? input.nowMin : undefined,
            input.slotIntervalMin,
          );
    if (check.ok) {
      plan.dates.push({
        date: iso,
        slots: check.slots,
        slotIntervalMin: input.slotIntervalMin || day.slotIntervalMin,
        warnings: check.warnings,
      });
    } else {
      plan.skipped.push({ date: iso, code: check.code, reason: SKIP_LABEL[check.code], error: check.error });
    }
  }
  return plan;
}
