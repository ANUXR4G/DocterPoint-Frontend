"use client"

import {
  countQueueStatusFilters,
  queueFilterLabel,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"

const FILTER_KEYS: QueueStatusFilter[] = [
  "all",
  "booked",
  "accepted",
  "waiting",
  "in_appointment",
  "done",
]

type Props = {
  value: QueueStatusFilter
  onChange: (value: QueueStatusFilter) => void
  /** Status strings to count (booking.status or patient.lastStatus). */
  statuses: Array<string | null | undefined>
  className?: string
  ariaLabel?: string
}

/** Shared visit-status filter chips for queue / appointments / patients tables. */
export default function BookingStatusFilterBar({
  value,
  onChange,
  statuses,
  className = "",
  ariaLabel = "Filter by visit status",
}: Props) {
  const counts = countQueueStatusFilters(statuses)

  return (
    <div
      className={`flex flex-wrap gap-1.5 ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {FILTER_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            value === key
              ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
              : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {queueFilterLabel(key, counts[key])}
        </button>
      ))}
    </div>
  )
}
