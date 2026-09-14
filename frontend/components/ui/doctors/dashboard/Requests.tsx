"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format, startOfToday } from "date-fns"
import { CoolKid } from "@/components"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"

/** Today's clinic bookings sidebar (Procto) — replaces legacy appointment requests. */
export default function Requests() {
  const [today] = useState(() => startOfToday())
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<ProctoBooking[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const mine = await proctoService.getMyPractices()
      if (cancelled) return
      if (mine.status !== "successful" || !mine.data?.[0]?.practice?.id) {
        setBookings([])
        setLoading(false)
        return
      }
      const practiceId = mine.data[0].practice.id as string
      const date = format(today, "yyyy-MM-dd")
      const res = await proctoService.listPracticeBookings(practiceId, date)
      if (cancelled) return
      const list = ((res?.data ?? []) as ProctoBooking[]).filter((b) => {
        const s = (b.status || "").toUpperCase()
        return s !== "CANCELED" && s !== "COMPLETED" && s !== "NO_SHOW"
      })
      setBookings(list.slice(0, 8))
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [today])

  if (loading) {
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
              <span className="w-fit rounded-md bg-white px-2 pb-0.5 text-xs font-bold text-neutral-700 dark:bg-neutral-300">
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
            Full queue →
          </Link>
        </div>
      ) : (
        <div className="center hidden size-full rounded-[26px] bg-neutral-800 text-white lg:flex">
          <div className="mt-4 flex flex-col">
            <h3 className="text-5xl font-bold 2xl:text-6xl 2xl:leading-10">
              {format(today, "d")}
            </h3>
            <div className="ml-2 flex flex-col 2xl:mb-1 2xl:mt-1">
              <span className="text-2xl font-bold 2xl:text-4xl 2xl:leading-9">
                {format(today, "MMMM")}
              </span>
              <span className="ml-1 mt-1 text-sm font-semibold leading-4 opacity-65">
                {format(today, "iiii")}
              </span>
              <span className="ml-1 mt-1 text-sm font-semibold leading-4 opacity-65">
                no active bookings today
              </span>
              <div className="size-48">
                <CoolKid />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
