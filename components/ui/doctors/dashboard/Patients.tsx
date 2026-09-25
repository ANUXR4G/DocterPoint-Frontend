"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import {
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"

/** Clinic patients from Procto bookings. */
export default function Patients() {
  const { ready, hydrated, loading, patients: rows } = usePracticeDashboard()
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const showLoading = (!ready && loading) || (ready && !hydrated)

  const filtered = useMemo(
    () =>
      rows
        .filter((p) =>
          matchesQueueStatusFilter(p.lastStatus || "", statusFilter),
        )
        .slice(0, 12),
    [rows, statusFilter],
  )

  return (
    <div className="mt-2 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="ml-0 text-start text-lg font-semibold text-neutral-900 dark:text-white sm:ml-2 sm:text-xl lg:text-2xl">
          Patients
        </h1>
        <Link
          className="inline-flex items-center gap-x-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 shadow-sm hover:bg-gray-50 dark:bg-neutral-300 dark:hover:bg-neutral-200"
          href={practiceTabHref("patients")}
        >
          View all
        </Link>
      </div>
      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={rows.map((p) => p.lastStatus)}
        className="mt-3"
      />
      {showLoading ? (
        <p className="ml-2.5 mt-2.5 text-sm font-semibold text-neutral-500">
          Loading…
        </p>
      ) : filtered.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {filtered.map((p) => (
            <li
              key={p.phone}
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800"
            >
              <p className="font-semibold">{p.name || p.phone}</p>
              {p.mrn?.trim() ? (
                <p className="text-xs font-semibold tabular-nums tracking-wide opacity-70">
                  MRN {p.mrn.trim()}
                </p>
              ) : null}
              <p className="text-xs opacity-70">
                {bookingStatusLabel(p.lastStatus || "")} · {p.bookingCount}{" "}
                visit{p.bookingCount === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ml-2.5 mt-2.5 text-sm font-semibold text-neutral-500">
          No patients yet.
        </p>
      )}
    </div>
  )
}
