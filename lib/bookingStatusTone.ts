/** Shared status pill colours for bookings across patient UI. */
export function bookingStatusTone(status: string) {
  switch ((status || "").toUpperCase()) {
    case "IN_PROGRESS":
      return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200"
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200"
    case "CANCELED":
    case "NO_SHOW":
      return "bg-neutral-500/10 text-neutral-600 ring-1 ring-neutral-400/30 dark:text-neutral-300"
    default:
      return "bg-blue-500/10 text-blue-800 ring-1 ring-blue-500/25 dark:text-sky-100"
  }
}

export function formatBookingStatus(status: string) {
  return (status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
