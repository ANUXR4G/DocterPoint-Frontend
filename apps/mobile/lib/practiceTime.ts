/**
 * Clinic wall-clock timezone — must match backend PRACTICE_TIMEZONE.
 */
export const PRACTICE_TIMEZONE = "Asia/Kolkata";

/** Calendar day in the clinic's time zone, e.g. "2026-09-30" (sortable). */
export function practiceDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRACTICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatPracticeDate(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  const p = zonedParts(d);
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

/** 12-hour clinic clock. Asia/Kolkata is UTC+5:30 with no daylight saving. */
export function formatPracticeTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  const shifted = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const hour24 = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad2(minute)} ${period}`;
}

export function formatPracticeDateTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const date = formatPracticeDate(input, "");
  const time = formatPracticeTime(input, "");
  if (!date || !time) return empty;
  return `${date} ${time}`;
}
