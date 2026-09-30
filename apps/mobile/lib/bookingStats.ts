import { practiceDayKey } from "@/lib/practiceTime";
import { colors } from "@/lib/theme";
import {
  bookingWhen,
  isUpcomingStatus,
  type ProctoBooking,
} from "@/lib/types";

export function bookingStatusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS") return { bg: colors.amberLight, fg: "#b45309" };
  if (s === "COMPLETED") return { bg: colors.emeraldLight, fg: colors.success };
  if (s === "ACCEPTED" || s === "CONFIRMED")
    return { bg: colors.brandMist, fg: colors.brand };
  if (s === "WAITING" || s === "CHECKED_IN")
    return { bg: colors.brandLight, fg: colors.brand };
  if (s === "CANCELED" || s === "CANCELLED" || s === "NO_SHOW")
    return { bg: colors.brandMist, fg: colors.inkSoft };
  return { bg: colors.brandLight, fg: colors.inkSoft };
}

export function bookingStatusLabel(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "WAITING") return "In waiting";
  if (s === "IN_PROGRESS") return "In consultation";
  if (s === "NO_SHOW") return "Missed";
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
    const d = new Date(session);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(12, 0, 0, 0);
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

/** Active status and today or later (clinic day) — visits from past days the clinic never closed are not upcoming. */
export function isUpcomingBooking(b: ProctoBooking, now = Date.now()) {
  if (!isUpcomingStatus(b.status)) return false;
  const ms = bookingWhenMs(b);
  return !ms || practiceDayKey(ms) >= practiceDayKey(now);
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

export function nextVisitSubtitle(booking: ProctoBooking | undefined) {
  if (!booking) return "Book a clinic to get started";
  const clinic = booking.practice?.name || "Clinic";
  return `${clinic} · ${bookingWhen(booking)}`;
}
