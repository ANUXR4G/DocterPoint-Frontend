"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { proctoService } from "@/lib/services/procto"
import {
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"

type PracticePatient = {
  phone: string
  name: string | null
  gender?: string | null
  bookingCount: number
  lastStatus: string | null
}

/** Clinic patients from Procto bookings. */
export default function Patients() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<PracticePatient[]>([])
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
      const res = await proctoService.listPracticePatients(practiceId)
      if (cancelled) return
      setRows((res?.data ?? []) as PracticePatient[])
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
          Patient history
        </h1>
        <Link
          className="inline-flex items-center gap-x-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 shadow-sm hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-300 dark:text-neutral-900 dark:hover:bg-neutral-200"
          href={practiceTabHref("patients")}
        >
          view patients
        </Link>
      </div>
      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={rows.map((p) => p.lastStatus)}
        className="mt-3"
        ariaLabel="Filter patients by last visit status"
      />
      {loading ? (
        <p className="ml-2.5 mt-2.5 text-sm font-semibold text-neutral-500">
          Loading…
        </p>
      ) : filtered.length > 0 ? (
        <>
          <ul className="mt-3 space-y-2 md:hidden">
            {filtered.map((p) => (
              <li
                key={p.phone}
                className="rounded-2xl border border-neutral-300 bg-white p-3 dark:border-neutral-600 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {p.name || "Unknown"}
                    </p>
                    <p className="text-xs text-neutral-500">{p.phone}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {p.bookingCount} visits
                  </span>
                </div>
                <p className="mt-2 text-xs capitalize text-neutral-500">
                  {p.gender || "—"} ·{" "}
                  <span className="font-bold">
                    {bookingStatusLabel(p.lastStatus || "")}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:block">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Visits</th>
                  <th className="px-4 py-3">Last status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((p) => (
                  <tr key={p.phone}>
                    <td className="px-4 py-3 font-semibold">
                      {p.name || "Unknown"}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.phone}</td>
                    <td className="px-4 py-3 capitalize">{p.gender || "—"}</td>
                    <td className="px-4 py-3">{p.bookingCount}</td>
                    <td className="px-4 py-3 text-xs font-bold">
                      {bookingStatusLabel(p.lastStatus || "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ml-2.5 mt-2.5 flex text-sm font-semibold text-neutral-500">
          No patient record matches this status filter
        </div>
      )}
    </div>
  )
}
