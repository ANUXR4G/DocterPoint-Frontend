import type { ProctoBooking } from "@/lib/services/procto"
import {
  formatPracticeDate,
  formatPracticeDateTime,
  formatPracticeTime,
  practiceDateIso,
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

/** Patient's chief complaint / reason for visit (`disease`); "" when not given. */
export function chiefComplaintOf(booking: { disease?: string | null }): string {
  const d = booking.disease?.trim() || ""
  return d && !/^general\s+consultation$/i.test(d) ? d : ""
}

/**
 * When the patient reached the clinic, e.g. "10:42 AM" — with the date
 * prefixed when it isn't the appointment day. "" when not arrived yet.
 */
export function formatArrival(booking: {
  arrivedAt?: string | null
  arrived_at?: string | null
  slotStart?: string | null
  slot_start?: string | null
  sessionDate?: string | null
  session_date?: string | null
}): string {
  const at = booking.arrivedAt ?? booking.arrived_at
  if (!at) return ""
  const time = formatPracticeTime(at, "")
  if (!time) return ""
  const visitDay = practiceDateIso(
    booking.slotStart ??
      booking.slot_start ??
      booking.sessionDate ??
      booking.session_date,
  )
  const arrivalDay = practiceDateIso(at)
  return visitDay && arrivalDay && visitDay !== arrivalDay
    ? `${formatPracticeDate(at)}, ${time}`
    : time
}

export const EMERGENCY_WALK_IN = "EMERGENCY_WALK_IN"

export function isEmergencyWalkIn(booking: {
  consultationType?: string | null
  consultation_type?: string | null
}): boolean {
  return (
    (booking.consultationType ?? booking.consultation_type ?? "") ===
    EMERGENCY_WALK_IN
  )
}

/** Human label for `consultationType` (internal codes → readable text). */
export function consultationTypeLabel(
  value: string | null | undefined,
): string {
  if (!value) return ""
  return value === EMERGENCY_WALK_IN ? "Emergency walk-in" : value
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
