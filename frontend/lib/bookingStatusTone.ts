/** Shared status pill colours for bookings across patient UI. */
export function bookingStatusTone(status: string) {
  switch ((status || "").toUpperCase()) {
    case "IN_PROGRESS":
      return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200"
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200"
    case "CANCELED":
    case "CANCELLED":
      return "bg-rose-500/15 text-rose-800 ring-1 ring-rose-500/30 dark:text-rose-200"
    case "NO_SHOW":
      return "bg-violet-500/15 text-violet-800 ring-1 ring-violet-500/30 dark:text-violet-200"
    case "WAITING":
    case "CHECKED_IN":
      return "bg-teal-500/15 text-teal-800 ring-1 ring-teal-500/30 dark:text-teal-200"
    default:
      // Upcoming / scheduled — amber (moved off calendar day cells)
      return "bg-amber-400/20 text-amber-900 ring-1 ring-amber-500/35 dark:text-amber-100"
  }
}

export function formatBookingStatus(status: string) {
  return (status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
