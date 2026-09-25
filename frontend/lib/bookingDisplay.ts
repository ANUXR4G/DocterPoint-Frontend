import type { ProctoBooking } from "@/lib/services/procto"
import {
  formatPracticeDate,
  formatPracticeDateTime,
  PRACTICE_TIMEZONE,
} from "@/lib/practiceTime"

/** Statuses that still represent an upcoming / active clinic visit. */
export const ACTIVE_BOOKING_STATUSES = new Set([
  "SCHEDULED",
  "REQUESTED",
  "ACCEPTED",
  "CONFIRMED",
  "WAITING",
  "IN_PROGRESS",
])

export function isActiveBooking(booking: ProctoBooking): boolean {
  return ACTIVE_BOOKING_STATUSES.has((booking.status || "").toUpperCase())
}

/** Milliseconds for sorting — prefers slot time, then token session day, then created. */
export function bookingWhenMs(booking: ProctoBooking): number {
  const slot = booking.slotStart ?? booking.slot_start
  if (slot) {
    const t = new Date(slot).getTime()
    if (!Number.isNaN(t)) return t
  }

  const session = booking.sessionDate ?? booking.session_date
  if (session) {
    const d = new Date(session)
    if (!Number.isNaN(d.getTime())) {
      // Midday UTC avoids date-boundary drift when only a calendar day is known.
      d.setUTCHours(12, 0, 0, 0)
      return d.getTime()
    }
  }

  const created = booking.createdAt ?? booking.created_at
  if (created) {
    const t = new Date(created).getTime()
    if (!Number.isNaN(t)) return t
  }

  return 0
}

export function sortBookingsByWhen(
  bookings: ProctoBooking[],
  direction: "asc" | "desc" = "asc",
): ProctoBooking[] {
  return [...bookings].sort((a, b) => {
    const diff = bookingWhenMs(a) - bookingWhenMs(b)
    return direction === "asc" ? diff : -diff
  })
}

export function formatBookingWhenDetailed(booking: ProctoBooking): string {
  const mode = booking.mode
  const token = booking.tokenNumber ?? booking.token_number
  const session = booking.sessionDate ?? booking.session_date
  const slot = booking.slotStart ?? booking.slot_start

  if (mode === "TOKEN_BASED" && token != null) {
    const day = session
      ? new Date(session).toLocaleDateString("en-US", {
          timeZone: PRACTICE_TIMEZONE,
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : ""
    return `Token #${token}${day ? ` · ${day}` : ""}`
  }

  if (slot) {
    return new Date(slot).toLocaleString("en-US", {
      timeZone: PRACTICE_TIMEZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  if (session) {
    return formatPracticeDate(session)
  }

  return "—"
}

export function formatBookingWhenShort(booking: ProctoBooking): string {
  const slot = booking.slotStart ?? booking.slot_start
  if (slot) return formatPracticeDateTime(slot)
  const session = booking.sessionDate ?? booking.session_date
  if (session) return formatPracticeDate(session)
  return "—"
}
