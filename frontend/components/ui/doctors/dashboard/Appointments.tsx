"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { type ProctoBooking } from "@/lib/services/procto"
import {
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"

function patientLabel(b: ProctoBooking) {
  return (
    b.patientName ||
    b.patient_name ||
    b.patient?.name ||
    b.patientPhone ||
    b.patient_phone ||
    "Patient"
  )
}

/** Recent clinic bookings table from Procto. */
export default function Appointments() {
  const { ready, loading, bookings: allBookings } = usePracticeDashboard()
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")

  const showLoading = !ready && loading

  const rows = useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 14)
    return allBookings.filter((b) => {
      const slot = b.slotStart ?? (b as { slot_start?: string }).slot_start
      const session =
        b.sessionDate ?? (b as { session_date?: string }).session_date
      const day = slot
        ? String(slot).slice(0, 10)
        : session
          ? String(session).slice(0, 10)
          : null
      if (!day) return false
      const fromIso = format(from, "yyyy-MM-dd")
      const toIso = format(to, "yyyy-MM-dd")
      return day >= fromIso && day <= toIso
    })
  }, [allBookings])

  const filtered = useMemo(
    () =>
      rows
        .filter((b) => matchesQueueStatusFilter(b.status || "", statusFilter))
        .slice(0, 12),
    [rows, statusFilter],
  )

  return (
    <div className="mt-2 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="ml-0 text-start text-lg font-semibold text-neutral-900 dark:text-white sm:ml-2 sm:text-xl lg:text-2xl">
          Recent bookings
        </h1>
        <Link
          className="inline-flex items-center gap-x-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 shadow-sm hover:bg-gray-50 dark:bg-neutral-300 dark:hover:bg-neutral-200"
          href="/doctor/calendar"
        >
          Open calendar
        </Link>
      </div>
      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={rows.map((b) => b.status)}
        className="mt-3"
      />
      {showLoading ? (
        <p className="ml-2.5 mt-2.5 text-sm font-semibold text-neutral-500">
          Loading…
        </p>
      ) : filtered.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2 md:hidden">
            {filtered.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border border-neutral-300 bg-white p-3 dark:border-neutral-600 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{patientLabel(b)}</p>
                    <p className="text-xs text-neutral-500">
                      {b.patientPhone || b.patient_phone || ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold">
                    {bookingStatusLabel(b.status || "")}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold opacity-70">
                  {b.disease || b.consultationType || "—"}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold">
                      {patientLabel(b)}
                    </td>
                    <td className="px-4 py-3">
                      {bookingStatusLabel(b.status || "")}
                    </td>
                    <td className="px-4 py-3">
                      {b.disease || b.consultationType || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="ml-2.5 mt-2.5 text-sm font-semibold text-neutral-500">
          No recent bookings.
        </p>
      )}
    </div>
  )
}
