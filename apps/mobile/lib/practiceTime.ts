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

export function formatPracticeTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleTimeString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatPracticeDateTime(
  input: Date | string | null | undefined,
  empty = "—",
): string {
  if (input == null || input === "") return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleString("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
