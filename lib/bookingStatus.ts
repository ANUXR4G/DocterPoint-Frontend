/** Shared clinic/doctor visit status labels and queue actions. */

/**
 * Clinic-facing visit status (queue / practice / doctor portals).
 * Maps enum → plain language for front desk flow.
 */
export function bookingStatusLabel(status: string): string {
  switch (String(status || "").toUpperCase()) {
    case "SCHEDULED":
    case "REQUESTED":
    case "BOOKED":
    case "CONFIRMED":
    case "ACCEPTED":
      return "Accepted"
    case "WAITING":
    case "CHECKED_IN":
      return "In waiting"
    case "IN_PROGRESS":
      return "Appointment started"
    case "COMPLETED":
      return "Appointment finished"
    case "NO_SHOW":
      return "No-show"
    case "CANCELED":
    case "CANCELLED":
      return "Canceled"
    default:
      return String(status || "—").replace(/_/g, " ")
  }
}

export function bookingStatusClass(status: string): string {
  switch (String(status || "").toUpperCase()) {
    case "ACCEPTED":
    case "CONFIRMED":
      return "bg-teal-100 text-teal-800 dark:bg-[#042f2e] dark:text-[#99f6e4]"
    case "WAITING":
    case "CHECKED_IN":
      return "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
    case "IN_PROGRESS":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-100"
    case "CANCELED":
    case "CANCELLED":
      return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-100"
    case "NO_SHOW":
      return "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
    default:
      return "bg-sky-100 text-sky-800 dark:bg-neutral-800 dark:text-neutral-100"
  }
}

export function bookingActionSelectClass(status: string): string {
  switch (String(status || "").toUpperCase()) {
    case "ACCEPTED":
      return "border-teal-400 bg-teal-100 text-teal-900 dark:border-[#2dd4bf] dark:bg-[#042f2e] dark:text-[#99f6e4]"
    case "WAITING":
      return "border-violet-400 bg-violet-100 text-violet-900 dark:border-[#a78bfa] dark:bg-violet-950/40 dark:text-violet-100"
    case "IN_PROGRESS":
      return "border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    case "COMPLETED":
      return "border-green-500 bg-green-100 text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100"
    case "CANCELED":
      return "border-red-400 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
    case "NO_SHOW":
      return "border-neutral-400 bg-neutral-200 text-neutral-800 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100"
    default:
      return "border-sky-400 bg-sky-100 text-sky-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
  }
}

/** Finished / closed visits — status must not change again. */
export function isTerminalVisitStatus(status: string): boolean {
  return ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
    String(status || "").toUpperCase(),
  )
}

/** Full status list clinic/doctor can set from queue / appointments. */
export function bookingStatusControlOptions(): Array<{
  status: string
  label: string
}> {
  return [
    { status: "ACCEPTED", label: "Accepted" },
    { status: "WAITING", label: "In waiting" },
    { status: "IN_PROGRESS", label: "Appointment started" },
    { status: "COMPLETED", label: "Appointment finished" },
    { status: "NO_SHOW", label: "No-show" },
    { status: "CANCELED", label: "Canceled" },
  ]
}

/** Normalize UI / legacy values to a selectable control value. */
export function bookingStatusControlValue(status: string): string {
  switch (String(status || "").toUpperCase()) {
    case "REQUESTED":
    case "BOOKED":
    case "SCHEDULED":
      return "ACCEPTED"
    case "CONFIRMED":
      return "ACCEPTED"
    case "CHECKED_IN":
      return "WAITING"
    case "CANCELLED":
      return "CANCELED"
    default:
      return String(status || "SCHEDULED").toUpperCase()
  }
}

/**
 * Queue actions (auto-accepted on book — no manual Accept step):
 * Accepted → Arrived (Waiting) → Appointment started → Appointment finished
 */
export function bookingNextActions(
  status: string,
): Array<{ status: string; label: string }> {
  switch (String(status || "").toUpperCase()) {
    case "SCHEDULED":
    case "REQUESTED":
    case "BOOKED":
    case "ACCEPTED":
    case "CONFIRMED":
      return [
        { status: "WAITING", label: "Arrived" },
        { status: "NO_SHOW", label: "No-show" },
        { status: "CANCELED", label: "Cancel" },
      ]
    case "WAITING":
    case "CHECKED_IN":
      return [
        { status: "IN_PROGRESS", label: "Start appointment" },
        { status: "NO_SHOW", label: "No-show" },
        { status: "CANCELED", label: "Cancel" },
      ]
    case "IN_PROGRESS":
      return [
        { status: "COMPLETED", label: "Finish appointment" },
        { status: "NO_SHOW", label: "No-show" },
      ]
    case "COMPLETED":
    case "CANCELED":
    case "CANCELLED":
    case "NO_SHOW":
      // Finished visits are locked — no cancel / reopen / reschedule actions.
      return []
    default:
      return []
  }
}

export type QueueStatusFilter =
  | "all"
  | "booked"
  | "accepted"
  | "waiting"
  | "in_appointment"
  | "done"

export function matchesQueueStatusFilter(
  status: string,
  filter: QueueStatusFilter,
): boolean {
  const s = String(status || "").toUpperCase()
  switch (filter) {
    case "booked":
      // Legacy "requested" bucket — auto-accept means these are treated as accepted.
      return false
    case "accepted":
      return [
        "SCHEDULED",
        "REQUESTED",
        "BOOKED",
        "ACCEPTED",
        "CONFIRMED",
      ].includes(s)
    case "waiting":
      return s === "WAITING" || s === "CHECKED_IN"
    case "in_appointment":
      return s === "IN_PROGRESS"
    case "done":
      return ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(s)
    default:
      return true
  }
}

/** Short filter chip titles for clinic queue. */
export function queueFilterLabel(
  key: QueueStatusFilter,
  count: number,
): string {
  const titles: Record<QueueStatusFilter, string> = {
    all: "All",
    booked: "Requested",
    accepted: "Accepted",
    waiting: "In waiting",
    in_appointment: "Started",
    done: "Finished",
  }
  return `${titles[key]} (${count})`
}

/** Count bookings (or last-status values) per queue filter chip. */
export function countQueueStatusFilters(
  statuses: Array<string | null | undefined>,
): Record<QueueStatusFilter, number> {
  const c: Record<QueueStatusFilter, number> = {
    all: statuses.length,
    booked: 0,
    accepted: 0,
    waiting: 0,
    in_appointment: 0,
    done: 0,
  }
  for (const status of statuses) {
    if (matchesQueueStatusFilter(String(status || ""), "booked")) c.booked += 1
    if (matchesQueueStatusFilter(String(status || ""), "accepted"))
      c.accepted += 1
    if (matchesQueueStatusFilter(String(status || ""), "waiting")) c.waiting += 1
    if (matchesQueueStatusFilter(String(status || ""), "in_appointment")) {
      c.in_appointment += 1
    }
    if (matchesQueueStatusFilter(String(status || ""), "done")) c.done += 1
  }
  return c
}
