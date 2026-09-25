/**
 * Clinic wall-clock timezone + 12-hour display helpers.
 * Must stay aligned with backend PRACTICE_TIMEZONE (default Asia/Kolkata).
 */

export const PRACTICE_TIMEZONE =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_PRACTICE_TIMEZONE?.trim()) ||
  "Asia/Kolkata"

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function zonedParts(date: Date, timeZone = PRACTICE_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  }
}

/** YYYY-MM-DD in clinic timezone. */
export function practiceDateIso(input: Date | string | null | undefined): string | null {
  if (input == null || input === "") return null
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  const p = zonedParts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** 12-hour time only, e.g. "11:40 AM". */
export function formatPracticeTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return empty
  return d.toLocaleTimeString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Date + 12-hour time, e.g. "9/25/2026, 11:40 AM". */
export function formatPracticeDateTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return empty
  return d.toLocaleString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Short date in clinic TZ, e.g. "Sep 25, 2026". */
export function formatPracticeDate(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return empty
  return d.toLocaleDateString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** YYYY-MM-DD for "today" in clinic timezone. */
export function practiceTodayIso(): string {
  return practiceDateIso(new Date()) || new Date().toISOString().slice(0, 10)
}

/** Shift a YYYY-MM-DD calendar date by N days (clinic calendar arithmetic). */
export function practiceShiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  return utc.toISOString().slice(0, 10)
}

/** First/last YYYY-MM-DD of the clinic calendar month containing `iso`. */
export function practiceMonthRange(iso = practiceTodayIso()): {
  from: string
  to: string
} {
  const [y, m] = iso.split("-").map(Number)
  if (!y || !m) return { from: iso, to: iso }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  }
}

/** Hour 0–23 in clinic timezone (for calendar hour rows). */
export function practiceHour(input: Date | string): number {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return 0
  return zonedParts(d).hour
}

/** Minutes past midnight in clinic TZ. */
export function practiceMinutesOfDay(input: Date | string): number {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return 0
  const p = zonedParts(d)
  return p.hour * 60 + p.minute
}
