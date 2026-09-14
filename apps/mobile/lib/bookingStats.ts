import {
  bookingWhen,
  isUpcomingStatus,
  type ProctoBooking,
} from "@/lib/types";

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

export function getUpcomingBookings(bookings: ProctoBooking[]) {
  return sortBookingsByWhen(
    bookings.filter((b) => isUpcomingStatus(b.status)),
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
  const when = new Date(whenMs);
  const now = new Date();
  const diffDays = Math.ceil(
    (when.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
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
