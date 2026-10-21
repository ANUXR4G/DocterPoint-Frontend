import {
  formatPracticeDate,
  formatPracticeTime,
  practiceDayKey,
} from "@/lib/practiceTime";
import { colors } from "@/lib/theme";
import {
  bookingWhen,
  isUpcomingStatus,
  type ProctoBooking,
} from "@/lib/types";

/** Open statuses the clinic never closed — past days → show as No show. */
const STALE_OPEN_STATUSES = new Set([
  "SCHEDULED",
  "REQUESTED",
  "ACCEPTED",
  "CONFIRMED",
  "WAITING",
  "CHECKED_IN",
  "IN_PROGRESS",
  "BOOKED",
]);

/** Status pill colours (same meanings previously used on calendar day cells). */
export function bookingStatusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS") return { bg: colors.amberLight, fg: "#b45309" };
  if (s === "COMPLETED") return { bg: colors.emeraldLight, fg: colors.success };
  if (s === "WAITING" || s === "CHECKED_IN")
    return { bg: colors.brandLight, fg: colors.brand };
  if (s === "ACCEPTED" || s === "CONFIRMED")
    return { bg: colors.brandMist, fg: colors.brand };
  if (s === "NO_SHOW") return { bg: colors.noShowBg, fg: colors.noShow };
  if (s === "CANCELED" || s === "CANCELLED")
    return { bg: colors.roseLight, fg: colors.danger };
  // Scheduled / upcoming — amber (was calendar day fill)
  return { bg: "#FEF3C7", fg: "#A16207" };
}

export function bookingStatusLabel(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "WAITING") return "In waiting";
  if (s === "IN_PROGRESS") return "In consultation";
  if (s === "NO_SHOW") return "No show";
  if (s === "CANCELED" || s === "CANCELLED") return "Cancelled";
  const words = s.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Medicines from the most recent visit that has any (the patient's current prescription). */
export function latestPrescription(bookings: ProctoBooking[]) {
  const withMeds = sortBookingsByWhen(
    bookings.filter(
      (b) =>
        Array.isArray(b.medicines) &&
        b.medicines.some((m) => m?.name?.trim()),
    ),
    "desc",
  );
  const booking = withMeds[0];
  if (!booking) return null;
  return {
    booking,
    medicines: (booking.medicines ?? []).filter((m) => m?.name?.trim()),
  };
}

export function bookingWhenMs(b: ProctoBooking): number {
  const slot = b.slotStart ?? b.slot_start;
  if (slot) {
    const t = new Date(slot).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const session = b.sessionDate ?? b.session_date;
  if (session) {
    const key = String(session).slice(0, 10);
    // Date-only → clinic noon so the calendar day does not shift with device TZ.
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const t = Date.parse(`${key}T12:00:00+05:30`);
      if (!Number.isNaN(t)) return t;
    }
    const d = new Date(session);
    if (!Number.isNaN(d.getTime())) {
      return d.getTime();
    }
  }
  return 0;
}

export function sortBookingsByWhen(
  bookings: ProctoBooking[],
  direction: "asc" | "desc" = "asc",
): ProctoBooking[] {
  return [...bookings].sort((a, b) => {
    const diff = bookingWhenMs(a) - bookingWhenMs(b);
    return direction === "asc" ? diff : -diff;
  });
}

/** Clinic never closed the visit and the visit day is before today (clinic TZ). */
export function isStaleOpenBooking(b: ProctoBooking, now = Date.now()) {
  const s = (b.status || "").toUpperCase();
  if (!STALE_OPEN_STATUSES.has(s)) return false;
  const ms = bookingWhenMs(b);
  if (!ms) return false;
  return practiceDayKey(ms) < practiceDayKey(now);
}

/** Status for badges — past open visits display as No show. */
export function effectiveBookingStatus(b: ProctoBooking, now = Date.now()) {
  if (isStaleOpenBooking(b, now)) return "NO_SHOW";
  return b.status || "";
}

/** Active status and today or later (clinic day) — past open visits are not upcoming. */
export function isUpcomingBooking(b: ProctoBooking, now = Date.now()) {
  if (isStaleOpenBooking(b, now)) return false;
  if (!isUpcomingStatus(b.status)) return false;
  const ms = bookingWhenMs(b);
  if (!ms) return false;
  return practiceDayKey(ms) >= practiceDayKey(now);
}

export function getUpcomingBookings(bookings: ProctoBooking[]) {
  const now = Date.now();
  return sortBookingsByWhen(
    bookings.filter((b) => isUpcomingBooking(b, now)),
    "asc",
  );
}

export function getCompletedBookings(bookings: ProctoBooking[]) {
  return bookings.filter(
    (b) => (b.status || "").toUpperCase() === "COMPLETED",
  );
}

export function getClinicCount(bookings: ProctoBooking[]) {
  return new Set(
    bookings.map((b) => b.practice?.name).filter((n): n is string => Boolean(n)),
  ).size;
}

export function nextVisitLabel(booking: ProctoBooking | undefined) {
  if (!booking) return "—";
  const whenMs = bookingWhenMs(booking);
  if (!whenMs) return "Scheduled";
  const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
  const diffDays = Math.round(
    (dayMs(practiceDayKey(whenMs)) - dayMs(practiceDayKey(Date.now()))) /
      86_400_000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

function isBookingMarker(text: string) {
  return /^e2e web book\b/i.test(text.trim());
}

/** The complaint the patient gave. Empty when the visit has none. */
export function chiefComplaintOf(booking: {
  disease?: string | null;
}): string {
  const disease = booking.disease?.trim() || "";
  if (!disease || isBookingMarker(disease) || /^general\s+consultation$/i.test(disease)) {
    return "";
  }
  return disease;
}

/** "Today, 10:30 AM" · "Tomorrow · Token #4" · "Fri, 3 Oct, 9:00 AM" (clinic time zone). */
export function visitDayTime(booking: ProctoBooking): string {
  const whenMs = bookingWhenMs(booking);
  if (!whenMs) return "Scheduled";
  const day = nextVisitLabel(booking);
  const dayText =
    day === "Today" || day === "Tomorrow"
      ? day
      : formatPracticeDate(new Date(whenMs));
  const slot = booking.slotStart ?? booking.slot_start;
  const clock = slot ? formatPracticeTime(slot) : "";
  const token = booking.tokenNumber ?? booking.token_number;
  if (booking.mode === "TOKEN_BASED" && token != null) {
    return clock ? `${dayText}, ${clock} · Token #${token}` : `${dayText} · Token #${token}`;
  }
  return clock ? `${dayText}, ${clock}` : dayText;
}

/** Relative start for timed visits: "in 45 minutes", "in 3 hours", "in 2 days". */
export function visitCountdown(booking: ProctoBooking, now = Date.now()): string {
  const slot = booking.slotStart ?? booking.slot_start;
  if (!slot) {
    const day = nextVisitLabel(booking);
    return day === "Today" ? "Visit today" : day.toLowerCase();
  }
  const mins = Math.round((new Date(slot).getTime() - now) / 60_000);
  if (Number.isNaN(mins)) return "";
  if (mins <= -30) return "Earlier today";
  if (mins <= 0) return "Starting now";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function nextVisitSubtitle(booking: ProctoBooking | undefined) {
  if (!booking) return "Book a clinic to get started";
  const clinic = booking.practice?.name || "Clinic";
  return `${clinic} · ${bookingWhen(booking)}`;
}
