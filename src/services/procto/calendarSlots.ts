import { OverrideType, ScheduleMode, type ProviderSchedule, type ScheduleOverride } from "@prisma/client";
import {
  formatHHMM,
  minutesOf,
  PRACTICE_TIMEZONE,
  practiceWeekday,
  schedulesForActiveMode,
} from "./slotEngine.js";

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

export type DayWindows = {
  /** Regular hours for the day, split around the break. */
  hours: TimeWindow[];
  /** Quick-created / admin extra bookable windows (EXTRA_SLOT overrides). */
  extra: Array<TimeWindow & { id: string; note: string | null }>;
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
  for (const r of active) {
    if (r.dayOfWeek !== weekday || r.mode !== ScheduleMode.TIME_BASED || !r.startTime || !r.endTime) continue;
    const s = minutesOf(r.startTime);
    const e = minutesOf(r.endTime);
    const bs = r.breakStartTime ? minutesOf(r.breakStartTime) : Number.NaN;
    const be = r.breakEndTime ? minutesOf(r.breakEndTime) : Number.NaN;
    if (!Number.isNaN(bs) && !Number.isNaN(be) && bs < be && bs < e && be > s) {
      if (bs > s) hours.push({ start: r.startTime, end: formatHHMM(bs) });
      if (be < e) hours.push({ start: formatHHMM(be), end: r.endTime });
    } else {
      hours.push({ start: r.startTime, end: r.endTime });
    }
  }
  hours.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));

  const extra: DayWindows["extra"] = [];
  const blocked: DayWindows["blocked"] = [];
  let dayOff: DayWindows["dayOff"] = null;
  for (const o of overrides) {
    if (o.type === OverrideType.EXTRA_SLOT && o.startTime && o.endTime) {
      extra.push({ id: o.id, start: o.startTime, end: o.endTime, note: o.reason });
    } else if (o.type === OverrideType.BLOCK_SLOT && o.startTime && o.endTime) {
      blocked.push({ start: o.startTime, end: o.endTime, type: o.type, reason: o.reason });
    } else if (o.type === OverrideType.BLOCK_DAY || o.type === OverrideType.EMERGENCY_LEAVE) {
      dayOff = { type: o.type, reason: o.reason };
    }
  }
  extra.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));

  return { hours, extra, blocked, dayOff, mode, slotIntervalMin: slotIntervalFor(active, date) };
}

/**
 * Validate a quick-create window against the doctor's day. `nowMin` = clinic minutes
 * past midnight when the day is today (slot starts must be strictly after it).
 */
export function checkExtraWindow(
  win: TimeWindow,
  day: DayWindows,
  nowMin?: number,
): { ok: true; slots: number } | { ok: false; error: string } {
  const s = minutesOf(win.start);
  const e = minutesOf(win.end);
  if (Number.isNaN(s) || Number.isNaN(e)) return { ok: false, error: "Times must be HH:MM." };
  if (e <= s) return { ok: false, error: "End time must be after the start time." };
  if (day.mode === ScheduleMode.TOKEN_BASED) {
    return { ok: false, error: "This doctor uses a token queue — extra time slots only work for time-slot booking." };
  }
  if (day.dayOff) {
    return { ok: false, error: "The doctor is on leave that day. Remove the leave first." };
  }
  const interval = day.slotIntervalMin;
  if (e - s < interval) {
    return { ok: false, error: `Pick at least ${interval} minutes — one slot is ${interval} minutes.` };
  }
  const hit = day.hours.find((h) => overlaps(win, h));
  if (hit) return { ok: false, error: `${range(win)} overlaps regular hours ${range(hit)}. Pick a time outside them.` };
  const extra = day.extra.find((x) => overlaps(win, x));
  if (extra) return { ok: false, error: `Extra slots already cover ${range(extra)}.` };
  const block = day.blocked.find((b) => overlaps(win, b));
  if (block) return { ok: false, error: `${range(block)} is blocked on this day.` };

  let slots = 0;
  for (let t = s; t + interval <= e; t += interval) {
    if (nowMin == null || t > nowMin) slots++;
  }
  if (!slots) return { ok: false, error: "That time has already passed. Pick a later time." };
  return { ok: true, slots };
}
