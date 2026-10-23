/**
 * Schedule Report Generator and Formatting Utilities
 *
 * Implements clinical doctor schedule reporting with Day, Week, Month, and Custom criteria,
 * matching clinic administrative reporting specifications.
 */

export interface ScheduleReportRow {
  sno: number
  date: string // e.g. "18/10/2026" or ""
  day: string // "Sunday", "Monday", etc.
  fromTime: string // "9 AM"
  toTime: string // "5 PM"
  breakTimeFrom: string // "1 PM"
  breakTimeTo: string // "2 PM"
  isOff?: boolean
  overrideReason?: string
}

export interface ScheduleReportSection {
  title?: string
  rows: ScheduleReportRow[]
}

export interface DoctorScheduleReportData {
  doctorId: string
  doctorName: string
  specialties?: string[]
  fromToLabel: string // e.g. "From Date : 18/10/2026 to 24/10/2026"
  sections: ScheduleReportSection[]
}

export interface ScheduleRuleItem {
  id?: string
  providerId: string
  dayOfWeek: number // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  startTime?: string | null
  endTime?: string | null
  breakStartTime?: string | null
  breakEndTime?: string | null
  sessionStart?: string | null
  sessionEnd?: string | null
  effectiveFrom?: string | Date
  isActive?: boolean
  status?: string
}

export interface ScheduleOverrideItem {
  id?: string
  providerId: string
  date: string | Date
  type: "OFF" | "EXTRA_SLOT" | string
  startTime?: string | null
  endTime?: string | null
  reason?: string | null
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

/** Formats "09:00", "17:00", "13:00", "12:00" to "9 AM", "5 PM", "1 PM", "12 PM" */
export function formatScheduleTime(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""

  // If already formatted like "9 AM" or "5 PM"
  if (/^\d{1,2}(:\d{2})?\s*(AM|PM)$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  const parts = trimmed.split(":")
  if (parts.length < 2) return trimmed
  let h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h)) return trimmed

  const meridiem = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12

  if (isNaN(m) || m === 0) {
    return `${h} ${meridiem}`
  }
  const mm = m < 10 ? `0${m}` : `${m}`
  return `${h}:${mm} ${meridiem}`
}

/** Formats a Date or ISO string into DD/MM/YYYY */
export function formatReportDate(d: Date | string): string {
  if (!d) return ""
  if (typeof d === "string") {
    // If already in YYYY-MM-DD
    const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
    }
  }
  const dateObj = typeof d === "string" ? new Date(d) : d
  if (isNaN(dateObj.getTime())) return String(d)
  const dd = String(dateObj.getDate()).padStart(2, "0")
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0")
  const yyyy = dateObj.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Extracts plain YYYY-MM-DD date key */
export function toDateKey(d: Date | string): string {
  if (typeof d === "string") {
    return d.slice(0, 10)
  }
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${yyyy}-${mm}-${dd}`
}

/** Adds N days to YYYY-MM-DD string */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Day of week for YYYY-MM-DD string: 0 = Sunday, 6 = Saturday */
export function getDayOfWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return d.getUTCDay()
}

/** Resolves active schedule version row for a provider on a specific date */
export function resolveScheduleOnDate(
  dateIso: string,
  rules: ScheduleRuleItem[],
  overrides?: ScheduleOverrideItem[],
): {
  isWorking: boolean
  fromTime: string
  toTime: string
  breakTimeFrom: string
  breakTimeTo: string
  isOverride?: boolean
  overrideReason?: string
} {
  const targetDayOfWeek = getDayOfWeek(dateIso)

  // Check overrides first
  if (overrides && overrides.length > 0) {
    const ov = overrides.find((o) => toDateKey(o.date) === dateIso)
    if (ov) {
      if (ov.type === "OFF") {
        return {
          isWorking: false,
          fromTime: "",
          toTime: "",
          breakTimeFrom: "",
          breakTimeTo: "",
          isOverride: true,
          overrideReason: ov.reason || "Day Off",
        }
      }
      if (ov.type === "EXTRA_SLOT") {
        return {
          isWorking: true,
          fromTime: formatScheduleTime(ov.startTime),
          toTime: formatScheduleTime(ov.endTime),
          breakTimeFrom: "",
          breakTimeTo: "",
          isOverride: true,
          overrideReason: ov.reason || "Extra Slot",
        }
      }
    }
  }

  // Filter rules with effectiveFrom <= dateIso
  const applicable = rules.filter((r) => {
    if (r.isActive === false) return false
    if (r.status && r.status !== "ACTIVE") return false
    const eff = r.effectiveFrom ? toDateKey(r.effectiveFrom) : "2000-01-01"
    return eff <= dateIso
  })

  if (applicable.length === 0) {
    return {
      isWorking: false,
      fromTime: "",
      toTime: "",
      breakTimeFrom: "",
      breakTimeTo: "",
    }
  }

  // Find latest effectiveFrom
  let latestEff = "2000-01-01"
  for (const r of applicable) {
    const eff = r.effectiveFrom ? toDateKey(r.effectiveFrom) : "2000-01-01"
    if (eff > latestEff) latestEff = eff
  }

  const versionRows = applicable.filter((r) => {
    const eff = r.effectiveFrom ? toDateKey(r.effectiveFrom) : "2000-01-01"
    return eff === latestEff
  })

  const dayRow = versionRows.find((r) => r.dayOfWeek === targetDayOfWeek)
  if (!dayRow || dayRow.isActive === false) {
    return {
      isWorking: false,
      fromTime: "",
      toTime: "",
      breakTimeFrom: "",
      breakTimeTo: "",
    }
  }

  const fromRaw = dayRow.startTime || dayRow.sessionStart
  const toRaw = dayRow.endTime || dayRow.sessionEnd

  return {
    isWorking: Boolean(fromRaw && toRaw),
    fromTime: formatScheduleTime(fromRaw),
    toTime: formatScheduleTime(toRaw),
    breakTimeFrom: formatScheduleTime(dayRow.breakStartTime),
    breakTimeTo: formatScheduleTime(dayRow.breakEndTime),
  }
}

/** Generates the 7-row report for Week Criteria */
export function buildWeekScheduleReport(
  doctor: { id: string; name: string; specialties?: string[] },
  weekStartIso: string, // Sunday
  rules: ScheduleRuleItem[],
  overrides?: ScheduleOverrideItem[],
): DoctorScheduleReportData {
  const weekEndIso = addDays(weekStartIso, 6)
  const fromToLabel = `From Date : ${formatReportDate(weekStartIso)} to ${formatReportDate(weekEndIso)}`

  const rows: ScheduleReportRow[] = []
  for (let i = 0; i < 7; i++) {
    const currentDayIso = addDays(weekStartIso, i)
    const dow = getDayOfWeek(currentDayIso)
    const timing = resolveScheduleOnDate(currentDayIso, rules, overrides)

    rows.push({
      sno: i + 1,
      date: formatReportDate(currentDayIso),
      day: WEEKDAYS[dow],
      fromTime: timing.isWorking ? timing.fromTime : "",
      toTime: timing.isWorking ? timing.toTime : "",
      breakTimeFrom: timing.isWorking ? timing.breakTimeFrom : "",
      breakTimeTo: timing.isWorking ? timing.breakTimeTo : "",
      isOff: !timing.isWorking,
      overrideReason: timing.overrideReason,
    })
  }

  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialties: doctor.specialties,
    fromToLabel,
    sections: [{ rows }],
  }
}

/** Generates the report for Month Criteria, automatically grouping periods when changes occur */
export function buildMonthScheduleReport(
  doctor: { id: string; name: string; specialties?: string[] },
  year: number,
  month: number, // 1 = Jan, 10 = Oct
  rules: ScheduleRuleItem[],
  overrides?: ScheduleOverrideItem[],
): DoctorScheduleReportData {
  const mmStr = String(month).padStart(2, "0")
  const firstDayIso = `${year}-${mmStr}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const lastDayIso = `${year}-${mmStr}-${String(daysInMonth).padStart(2, "0")}`
  const fromToLabel = `From Date : ${formatReportDate(firstDayIso)} TO ${formatReportDate(lastDayIso)}`

  // Gather timings for every day of the month
  const dailyTimings: Array<{
    dateIso: string
    dayName: string
    dayOfWeek: number
    dayOfMonth: number
    timing: ReturnType<typeof resolveScheduleOnDate>
  }> = []

  for (let d = 1; d <= daysInMonth; d++) {
    const curIso = `${year}-${mmStr}-${String(d).padStart(2, "0")}`
    const dow = getDayOfWeek(curIso)
    dailyTimings.push({
      dateIso: curIso,
      dayName: WEEKDAYS[dow],
      dayOfWeek: dow,
      dayOfMonth: d,
      timing: resolveScheduleOnDate(curIso, rules, overrides),
    })
  }

  // Check if timings for each weekday remain constant throughout the whole month
  const weekdaySignatures = new Map<number, Set<string>>()
  for (const item of dailyTimings) {
    const sig = `${item.timing.fromTime}-${item.timing.toTime}-${item.timing.breakTimeFrom}-${item.timing.breakTimeTo}`
    if (!weekdaySignatures.has(item.dayOfWeek)) {
      weekdaySignatures.set(item.dayOfWeek, new Set())
    }
    weekdaySignatures.get(item.dayOfWeek)!.add(sig)
  }

  let hasMidMonthChange = false
  for (const sigs of weekdaySignatures.values()) {
    if (sigs.size > 1) {
      hasMidMonthChange = true
      break
    }
  }

  // If no mid-month change, output single section with "Same timing for all the month"
  if (!hasMidMonthChange) {
    const rows: ScheduleReportRow[] = []
    for (let dow = 0; dow < 7; dow++) {
      // Find sample day for this weekday
      const sample = dailyTimings.find((t) => t.dayOfWeek === dow)
      const t = sample ? sample.timing : { fromTime: "", toTime: "", breakTimeFrom: "", breakTimeTo: "", isWorking: false }
      rows.push({
        sno: dow + 1,
        date: "", // Empty date as per user specification
        day: WEEKDAYS[dow],
        fromTime: t.isWorking ? t.fromTime : "",
        toTime: t.isWorking ? t.toTime : "",
        breakTimeFrom: t.isWorking ? t.breakTimeFrom : "",
        breakTimeTo: t.isWorking ? t.breakTimeTo : "",
      })
    }

    return {
      doctorId: doctor.id,
      doctorName: doctor.name,
      specialties: doctor.specialties,
      fromToLabel,
      sections: [
        {
          title: "Same timing for all the month",
          rows,
        },
      ],
    }
  }

  // There is a change mid-month!
  // Find the first date where the weekday timing differs from the start of the month
  let changeDateIso = ""
  for (const item of dailyTimings) {
    const dow = item.dayOfWeek
    const firstOccur = dailyTimings.find((t) => t.dayOfWeek === dow)
    const sigCur = `${item.timing.fromTime}-${item.timing.toTime}-${item.timing.breakTimeFrom}-${item.timing.breakTimeTo}`
    const sigFirst = firstOccur
      ? `${firstOccur.timing.fromTime}-${firstOccur.timing.toTime}-${firstOccur.timing.breakTimeFrom}-${firstOccur.timing.breakTimeTo}`
      : ""
    if (sigCur !== sigFirst) {
      changeDateIso = item.dateIso
      break
    }
  }

  if (!changeDateIso) {
    changeDateIso = `${year}-${mmStr}-25`
  }

  // Split date: find the week boundary or the exact change cutoff
  const changeIndex = dailyTimings.findIndex((t) => t.dateIso === changeDateIso)
  // Cutoff date is the day before the change
  const cutoffDateIso = addDays(changeDateIso, -1)
  const transitionStartIso = changeDateIso <= addDays(cutoffDateIso, 1) ? cutoffDateIso : changeDateIso

  // Section 1: "Same timing for 01/MM/YYYY to DD/MM/YYYY"
  const sec1Rows: ScheduleReportRow[] = []
  for (let dow = 0; dow < 7; dow++) {
    const sample = dailyTimings.slice(0, Math.max(1, changeIndex)).find((t) => t.dayOfWeek === dow)
    const t = sample ? sample.timing : { fromTime: "", toTime: "", breakTimeFrom: "", breakTimeTo: "", isWorking: false }
    sec1Rows.push({
      sno: dow + 1,
      date: "",
      day: WEEKDAYS[dow],
      fromTime: t.isWorking ? t.fromTime : "",
      toTime: t.isWorking ? t.toTime : "",
      breakTimeFrom: t.isWorking ? t.breakTimeFrom : "",
      breakTimeTo: t.isWorking ? t.breakTimeTo : "",
    })
  }

  // Section 2: "From DD/MM/YYYY to DD/MM/YYYY"
  const remainingDays = dailyTimings.slice(Math.max(0, changeIndex - (getDayOfWeek(changeDateIso) === 0 ? 0 : 2)))
  const sec2Rows: ScheduleReportRow[] = []
  let snoSec2 = 1
  for (const item of remainingDays) {
    const isNew = item.dateIso >= changeDateIso
    sec2Rows.push({
      sno: snoSec2++,
      date: isNew ? formatReportDate(item.dateIso) : "",
      day: item.dayName,
      fromTime: item.timing.isWorking ? item.timing.fromTime : "",
      toTime: item.timing.isWorking ? item.timing.toTime : "",
      breakTimeFrom: item.timing.isWorking ? item.timing.breakTimeFrom : "",
      breakTimeTo: item.timing.isWorking ? item.timing.breakTimeTo : "",
    })
  }

  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialties: doctor.specialties,
    fromToLabel,
    sections: [
      {
        title: `Same timing for ${formatReportDate(firstDayIso)} to ${formatReportDate(transitionStartIso)}`,
        rows: sec1Rows,
      },
      {
        title: `From ${formatReportDate(transitionStartIso)} to ${formatReportDate(lastDayIso)}`,
        rows: sec2Rows,
      },
    ],
  }
}

/** Generates the day-by-day table for Custom date range */
export function buildCustomScheduleReport(
  doctor: { id: string; name: string; specialties?: string[] },
  fromDateIso: string,
  toDateIso: string,
  rules: ScheduleRuleItem[],
  overrides?: ScheduleOverrideItem[],
): DoctorScheduleReportData {
  const fromToLabel = `From Date : ${formatReportDate(fromDateIso)} to ${formatReportDate(toDateIso)}`
  const rows: ScheduleReportRow[] = []

  let sno = 1
  const startDow = getDayOfWeek(fromDateIso)

  // As shown in the user's sample table, if the fromDate does not begin on Sunday,
  // the preceding Sunday and Monday of that week can be presented to anchor the calendar view
  if (startDow > 0) {
    for (let pre = 0; pre < startDow; pre++) {
      rows.push({
        sno: sno++,
        date: "",
        day: WEEKDAYS[pre],
        fromTime: "",
        toTime: "",
        breakTimeFrom: "",
        breakTimeTo: "",
      })
    }
  }

  // Iterate from fromDateIso to toDateIso
  let cur = fromDateIso
  while (cur <= toDateIso) {
    const dow = getDayOfWeek(cur)
    const timing = resolveScheduleOnDate(cur, rules, overrides)

    rows.push({
      sno: sno++,
      date: formatReportDate(cur),
      day: WEEKDAYS[dow],
      fromTime: timing.isWorking ? timing.fromTime : "",
      toTime: timing.isWorking ? timing.toTime : "",
      breakTimeFrom: timing.isWorking ? timing.breakTimeFrom : "",
      breakTimeTo: timing.isWorking ? timing.breakTimeTo : "",
      isOff: !timing.isWorking,
      overrideReason: timing.overrideReason,
    })

    cur = addDays(cur, 1)
  }

  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialties: doctor.specialties,
    fromToLabel,
    sections: [{ rows }],
  }
}

/** Generates single day schedule report row */
export function buildDayScheduleReport(
  doctor: { id: string; name: string; specialties?: string[] },
  dayIso: string,
  rules: ScheduleRuleItem[],
  overrides?: ScheduleOverrideItem[],
): DoctorScheduleReportData {
  const fromToLabel = `Date : ${formatReportDate(dayIso)}`
  const dow = getDayOfWeek(dayIso)
  const timing = resolveScheduleOnDate(dayIso, rules, overrides)

  const rows: ScheduleReportRow[] = [
    {
      sno: 1,
      date: formatReportDate(dayIso),
      day: WEEKDAYS[dow],
      fromTime: timing.isWorking ? timing.fromTime : "",
      toTime: timing.isWorking ? timing.toTime : "",
      breakTimeFrom: timing.isWorking ? timing.breakTimeFrom : "",
      breakTimeTo: timing.isWorking ? timing.breakTimeTo : "",
      isOff: !timing.isWorking,
      overrideReason: timing.overrideReason,
    },
  ]

  return {
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialties: doctor.specialties,
    fromToLabel,
    sections: [{ rows }],
  }
}

/** Export tabular report data to CSV string */
export function exportScheduleReportToCsv(reports: DoctorScheduleReportData[]): string {
  const lines: string[] = []

  for (const report of reports) {
    lines.push(`"Doctor: ${report.doctorName.replace(/"/g, '""')}","${report.fromToLabel.replace(/"/g, '""')}"`)
    for (const section of report.sections) {
      if (section.title) {
        lines.push(`"${section.title.replace(/"/g, '""')}"`)
      }
      lines.push("Sno,Date,Day,From time,To Time,Break Time From,Break Time to")
      for (const r of section.rows) {
        lines.push(
          [
            r.sno,
            `"${r.date}"`,
            `"${r.day}"`,
            `"${r.fromTime}"`,
            `"${r.toTime}"`,
            `"${r.breakTimeFrom}"`,
            `"${r.breakTimeTo}"`,
          ].join(","),
        )
      }
      lines.push("") // blank line between sections
    }
    lines.push("") // blank line between doctors
  }

  return lines.join("\n")
}
