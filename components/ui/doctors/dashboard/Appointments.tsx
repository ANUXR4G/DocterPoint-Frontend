"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"

function patientLabel(b: ProctoBooking) {
  return (
    b.patientName || b.patient_name || b.patient?.name || "Patient"
  )
}

function whenLabel(b: ProctoBooking) {
  const when =
    b.slotStart ||
    b.slot_start ||
    b.sessionDate ||
    b.session_date ||
    b.createdAt
  return when ? format(new Date(when), "dd MMM · HH:mm") : "—"
}

/** Recent clinic bookings table from Procto. */
export default function Appointments() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ProctoBooking[]>([])
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const mine = await proctoService.getMyPractices()
      if (cancelled) return
      const practiceId = mine?.data?.[0]?.practice?.id as string | undefined
      if (!practiceId) {
        setRows([])
        setLoading(false)
        return
      }
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 14)
      const res = await proctoService.listPracticeBookings(practiceId, {
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      })
      if (cancelled) return
      setRows((res?.data ?? []) as ProctoBooking[])
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
      {loading ? (
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
                  <span className="shrink-0 text-[10px] font-bold tracking-wide text-neutral-500">
                    {bookingStatusLabel(b.status || "")}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {whenLabel(b)}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {b.disease || b.consultationType || "—"}
                </p>
                <Link
                  href={`/doctor/queue/${b.id}`}
                  className="mt-2 inline-block text-xs font-bold text-[var(--theme-primary)] hover:underline"
                >
                  Open visit →
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Disease</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold">
                      {patientLabel(b)}
                      <p className="text-xs font-medium opacity-60">
                        {b.patientPhone || b.patient_phone}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                      {whenLabel(b)}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold">
                      {bookingStatusLabel(b.status || "")}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-xs">
                      {b.disease || b.consultationType || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="text-xs font-bold text-[var(--theme-primary)] hover:underline"
                      >
                        Visit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ml-2.5 mt-2.5 flex text-sm font-semibold text-neutral-500">
          No booking record matches this status filter
        </div>
      )}
    </div>
  )
}
