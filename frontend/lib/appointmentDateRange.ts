import {
  practiceMonthRange,
  practiceShiftDays,
  practiceTodayIso,
} from "@/lib/practiceTime"

export type AppointmentRangePreset =
  | "today"
  | "upcoming"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_3_months"
  | "last_6_months"
  | "custom"

export const APPOINTMENT_RANGE_PRESETS: Array<{
  key: AppointmentRangePreset
  label: string
}> = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_6_months", label: "Last 6 months" },
  { key: "custom", label: "Custom" },
]

/** Custom ranges are capped so one request cannot pull years of visits. */
export const MAX_CUSTOM_RANGE_DAYS = 366

/** "Upcoming" = today through this many clinic days ahead. */
export const UPCOMING_RANGE_DAYS = 90

export type IsoRange = { from: string; to: string }

function weekdayMon0(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  )
}

/** Weeks start on Monday; all dates are clinic-calendar YYYY-MM-DD. */
export function resolvePresetRange(
  preset: Exclude<AppointmentRangePreset, "custom">,
  today = practiceTodayIso(),
): IsoRange {
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "upcoming":
      return { from: today, to: practiceShiftDays(today, UPCOMING_RANGE_DAYS) }
    case "yesterday": {
      const y = practiceShiftDays(today, -1)
      return { from: y, to: y }
    }
    case "this_week": {
      const from = practiceShiftDays(today, -weekdayMon0(today))
      return { from, to: practiceShiftDays(from, 6) }
    }
    case "last_week": {
      const thisMonday = practiceShiftDays(today, -weekdayMon0(today))
      return {
        from: practiceShiftDays(thisMonday, -7),
        to: practiceShiftDays(thisMonday, -1),
      }
    }
    case "this_month":
      return practiceMonthRange(today)
    case "last_3_months":
      return { from: shiftMonths(today, -3), to: today }
    case "last_6_months":
      return { from: shiftMonths(today, -6), to: today }
  }
}

/** Short human label, e.g. "Sep 21 – Sep 27, 2026". */
export function formatIsoRange({ from, to }: IsoRange): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    })
  if (from === to) return fmt(from, true)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`
}
