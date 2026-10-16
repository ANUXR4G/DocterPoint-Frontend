import { practiceShiftDays, practiceTodayIso } from "./practiceTime"

/**
 * End date is the start date plus the duration.
 * 7 days from 2026-10-16 is 2026-10-23. Weeks are 7 days each.
 * Months keep the same day, or the last day of the target month.
 */
export function medicineEndDate(
  start: string,
  duration: string,
  unit: string,
): string | null {
  const count = Number(String(duration).trim())
  if (!Number.isFinite(count) || count <= 0) return null
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start.trim())
  if (!day) return null
  const label = unit.trim().toLowerCase()
  if (label.startsWith("day")) return practiceShiftDays(start, count)
  if (label.startsWith("week")) return practiceShiftDays(start, count * 7)
  if (!label.startsWith("month")) return null

  const year = Number(day[1])
  const monthIndex = Number(day[2]) - 1 + count
  const endYear = year + Math.floor(monthIndex / 12)
  const endMonth = ((monthIndex % 12) + 12) % 12
  const startDay = Number(day[3])
  const lastDay = new Date(Date.UTC(endYear, endMonth + 1, 0)).getUTCDate()
  const clamped = new Date(Date.UTC(endYear, endMonth, Math.min(startDay, lastDay)))
  return clamped.toISOString().slice(0, 10)
}

/** Start date shown on a new medicine row. */
export function defaultMedicineStartDate(): string {
  return practiceTodayIso()
}

/** Keep the same duration and move the end date to match a new start. */
export function medicineWithStartDate<
  T extends {
    startDate?: string
    endDate?: string
    duration?: string
    durationUnit?: string
  },
>(med: T, startDate: string): T {
  const start = startDate.trim() || defaultMedicineStartDate()
  const end = medicineEndDate(start, med.duration || "", med.durationUnit || "")
  return {
    ...med,
    startDate: start,
    ...(end ? { endDate: end } : {}),
  }
}
