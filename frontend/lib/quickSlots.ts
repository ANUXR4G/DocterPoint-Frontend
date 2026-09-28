import type { DayWindows, SlotWarning, TimeWindow } from "@/lib/services/procto"

export function toMin(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return Number.NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return Number.NaN
  return h * 60 + min
}

export function toHm(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`
}

/** "Priya Nair" → "Dr Priya Nair"; names already titled ("Dr. Priya") are kept. */
export function drName(name: string): string {
  const n = name.trim()
  return /^dr\b\.?/i.test(n) ? n : `Dr ${n}`
}

/** "17:00" → "5:00 PM". */
export function hm12(hm: string | number): string {
  const min = typeof hm === "number" ? hm : toMin(hm)
  if (Number.isNaN(min)) return String(hm)
  const h = Math.floor(min / 60) % 24
  const m = Math.round(min % 60)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

export const windowLabel = (w: TimeWindow) => `${hm12(w.start)}–${hm12(w.end)}`

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/** Drag / click snap: the slot length where it divides the hour, else 5 minutes. */
export function snapMinutes(interval: number): number {
  return Math.max(5, gcd(Math.max(5, interval), 60))
}

/** Windows that are already bookable (blocked time and breaks stay selectable, with a warning). */
export function occupiedWindows(
  day: DayWindows | undefined,
): Array<[number, number]> {
  if (!day) return []
  return [...day.hours, ...day.extra]
    .map((w) => [toMin(w.start), toMin(w.end)] as [number, number])
    .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e))
    .sort((a, b) => a[0] - b[0])
}

/** Free gap containing `min` within [lo, hi), or null when `min` is inside occupied time. */
export function freeGapAt(
  min: number,
  occupied: Array<[number, number]>,
  lo: number,
  hi: number,
): { from: number; to: number } | null {
  if (min < lo || min >= hi) return null
  let from = lo
  let to = hi
  for (const [s, e] of occupied) {
    if (min >= s && min < e) return null
    if (e <= min) from = Math.max(from, e)
    if (s > min) to = Math.min(to, s)
  }
  return from < to ? { from, to } : null
}

/** Same rules as the server (`calendarSlots.checkExtraWindow`). */
export function checkWindow(
  win: TimeWindow,
  day: DayWindows | undefined,
  nowMin?: number,
  slotIntervalMin?: number,
):
  | { ok: true; slots: number; warnings: SlotWarning[] }
  | { ok: false; error: string } {
  const s = toMin(win.start)
  const e = toMin(win.end)
  if (Number.isNaN(s) || Number.isNaN(e))
    return { ok: false, error: "Pick a start and end time." }
  if (e <= s)
    return { ok: false, error: "End time must be after the start time." }
  if (!day) return { ok: false, error: "Loading the doctor's day…" }
  if (day.mode === "TOKEN_BASED") {
    return {
      ok: false,
      error:
        "This doctor uses a token queue — extra time slots only work for time-slot booking.",
    }
  }
  const interval = slotIntervalMin || day.slotIntervalMin
  if (e - s < interval) {
    return {
      ok: false,
      error: `Pick at least ${interval} minutes — one slot is ${interval} minutes.`,
    }
  }
  const hit = (w: TimeWindow) => s < toMin(w.end) && e > toMin(w.start)
  const hours = day.hours.find(hit)
  if (hours)
    return {
      ok: false,
      error: `Overlaps regular hours ${windowLabel(hours)}. Pick a time outside them.`,
    }
  const extra = day.extra.find(hit)
  if (extra)
    return {
      ok: false,
      error: `Extra slots already cover ${windowLabel(extra)}.`,
    }
  let slots = 0
  for (let t = s; t + interval <= e; t += interval) {
    if (nowMin == null || t > nowMin) slots++
  }
  if (!slots)
    return {
      ok: false,
      error: "That time has already passed. Pick a later time.",
    }
  return { ok: true, slots, warnings: slotWarnings(win, day) }
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

/** Same warnings as the server (`calendarSlots.slotWarnings`). */
export function slotWarnings(win: TimeWindow, day: DayWindows): SlotWarning[] {
  const s = toMin(win.start)
  const e = toMin(win.end)
  const hit = (w: TimeWindow) => s < toMin(w.end) && e > toMin(w.start)
  const out: SlotWarning[] = []
  if (day.dayOff) {
    out.push({
      code: "leave",
      message: "Doctor is on leave this day.",
      detail:
        day.dayOff.reason?.trim() ||
        (day.dayOff.type === "EMERGENCY_LEAVE" ? "Emergency leave" : "Day off"),
    })
  } else if (day.mode && !day.hours.length) {
    out.push({
      code: "offDay",
      message: `Doctor is off duty on ${WEEKDAY_NAMES[day.weekday]}s.`,
      detail: "No regular hours that day",
    })
  }
  const brk = (day.breaks ?? []).find(hit)
  if (brk)
    out.push({
      code: "break",
      message: "Doctor is marked on break during this time.",
      detail: `Break ${windowLabel(brk)}`,
    })
  const block = day.blocked.find(hit)
  if (block)
    out.push({
      code: "blocked",
      message: "This time is blocked on the doctor's calendar.",
      detail: `Blocked ${windowLabel(block)}${block.reason?.trim() ? ` · ${block.reason.trim()}` : ""}`,
    })
  return out
}

/** Default start for "+ Slot" without a clicked time: right after the day's last bookable window. */
export function suggestedStart(
  day: DayWindows | undefined,
  nowMin?: number,
): number {
  const interval = day?.slotIntervalMin ?? 15
  const snap = snapMinutes(interval)
  const ends = [...(day?.hours ?? []), ...(day?.extra ?? [])].map((w) =>
    toMin(w.end),
  )
  let start = ends.length ? Math.max(...ends) : 17 * 60
  if (nowMin != null && start <= nowMin)
    start = Math.ceil((nowMin + 1) / snap) * snap
  return Math.min(start, 24 * 60 - interval)
}
