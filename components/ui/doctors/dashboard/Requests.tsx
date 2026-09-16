"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { format, startOfToday } from "date-fns"
import { type ProctoBooking } from "@/lib/services/procto"
import {
  filterBookingsByDate,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"

/** Today's clinic bookings sidebar (Procto) — replaces legacy appointment requests. */
export default function Requests() {
  const [today] = useState(() => startOfToday())
  const { ready, loading, bookings: allBookings } = usePracticeDashboard()
  const showLoading = !ready && loading

  const bookings = useMemo(() => {
    const date = format(today, "yyyy-MM-dd")
    return filterBookingsByDate(allBookings, date)
      .filter((b) => {
        const s = (b.status || "").toUpperCase()
        return s !== "CANCELED" && s !== "COMPLETED" && s !== "NO_SHOW"
      })
      .slice(0, 8) as ProctoBooking[]
  }, [allBookings, today])

  if (showLoading) {
    return (
      <div
        role="status"
        className="col-span-4 hidden min-h-[200px] animate-pulse rounded-[26px] bg-gray-300/75 lg:order-2 lg:col-span-1 lg:row-span-2 lg:block dark:bg-neutral-700/75"
      >
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <div className="col-span-4 w-full lg:order-2 lg:col-span-1 lg:row-span-2">
      {bookings.length > 0 ? (
        <div className="hidden max-h-[516px] flex-col gap-3 overflow-y-auto pr-1 custom-scroll lg:flex">
          {bookings.map((b) => (
            <Link
              key={b.id}
              href={`/doctor/queue/${b.id}`}
              className="relative flex min-h-28 flex-col rounded-[26px] bg-neutral-200 p-4 text-start text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100 dark:gradient-border-black"
            >
              <span className="w-fit rounded-md bg-white px-2 pb-0.5 text-xs font-bold text-neutral-700 dark:bg-neutral-300 dark:text-neutral-900">
                {(b.status || "BOOKED").replace(/_/g, " ")}
              </span>
              <p className="mt-2 line-clamp-1 text-sm font-bold">
                {b.patientName || b.patient_name || b.patient?.name || "Patient"}
              </p>
              <p className="mt-0.5 text-xs font-semibold opacity-70">
                {b.patientPhone || b.patient_phone || "—"}
              </p>
              <p className="mt-auto pt-2 text-xs font-semibold opacity-60">
                {b.disease || b.consultationType || "Visit"} · Open visit →
              </p>
            </Link>
          ))}
          <Link
            href="/doctor/queue"
            className="text-center text-sm font-bold text-[var(--theme-primary)] hover:underline"
          >
            Open full queue →
          </Link>
        </div>
      ) : (
        <div className="hidden min-h-[200px] flex-col items-center justify-center rounded-[26px] bg-neutral-200 p-6 text-center dark:bg-neutral-800 lg:flex">
          <p className="text-sm font-semibold opacity-70">No active visits today.</p>
          <Link
            href="/doctor/queue"
            className="mt-3 text-sm font-bold text-[var(--theme-primary)] hover:underline"
          >
            Open queue
          </Link>
        </div>
      )}
    </div>
  )
}
