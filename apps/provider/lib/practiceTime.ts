/**
 * Clinic wall-clock timezone + 12-hour display helpers.
 * Aligned with backend PRACTICE_TIMEZONE (default Asia/Kolkata).
 */

export const PRACTICE_TIMEZONE =
  (typeof process !== "undefined" &&
    process.env.EXPO_PUBLIC_PRACTICE_TIMEZONE?.trim()) ||
  "Asia/Kolkata";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(date: Date, timeZone = PRACTICE_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
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

export function practiceDateIso(
  input: Date | string | null | undefined,
): string | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const p = zonedParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
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

export function formatPracticeTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  const p = zonedParts(d);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
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

/** True when the clinic calendar day is after today. Same-day times stay open. */
export function isAfterClinicToday(
  input: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const day = practiceDateIso(input);
  const today = practiceDateIso(now);
  if (!day || !today) return false;
  return day > today;
}
