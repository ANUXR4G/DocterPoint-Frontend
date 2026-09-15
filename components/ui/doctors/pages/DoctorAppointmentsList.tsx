"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { addDays, format, subDays } from "date-fns"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import {
  formatBookingWhenDetailed,
  sortBookingsByWhen,
} from "@/lib/bookingDisplay"
import { PatientNameHover } from "@/components/ui/procto/PatientBookingHover"
import BookingStatusControls from "@/components/ui/procto/BookingStatusControls"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import { useProctoSocket } from "@/hooks/useProctoSocket"
import { applyLiveBookingEvent } from "@/lib/liveBooking"

/** Clinic bookings from Procto — synced with backend queue/calendar. */
export default function DoctorAppointmentsList({
  portal = "doctor",
}: {
  portal?: "doctor" | "clinic"
} = {}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [rows, setRows] = useState<ProctoBooking[]>([])
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [practiceName, setPracticeName] = useState("")
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setLoadError("")
    }
    const today = new Date()
    const boot = await proctoService.getPracticeBootstrap({
      from: format(subDays(today, 90), "yyyy-MM-dd"),
      to: format(addDays(today, 90), "yyyy-MM-dd"),
    })

    if (boot.status !== "successful" || !boot.data) {
      setRows([])
      setPracticeId(null)
      setPracticeName("")
      if (!opts?.silent) {
        setLoadError(boot.message || "Could not load your practice.")
        setLoading(false)
      }
      return
    }

    const memberships = (boot.data.memberships ?? []) as Array<{
      practice?: { id: string; name: string }
    }>
    const practice = memberships[0]?.practice
    if (!practice?.id) {
      setRows([])
      setPracticeId(null)
      setPracticeName("")
      if (!opts?.silent) {
        setLoadError("Could not load your practice.")
        setLoading(false)
      }
      return
    }

    setPracticeId(practice.id)
    setPracticeName(practice.name)

    const list = sortBookingsByWhen(
      (Array.isArray(boot.data.bookings) ? boot.data.bookings : []) as ProctoBooking[],
      "asc",
    )
    setRows(list)
    if (!opts?.silent) setLoading(false)
  }, [])

  function scheduleSoft() {
    if (softTimer.current) clearTimeout(softTimer.current)
    softTimer.current = setTimeout(() => void load({ silent: true }), 250)
  }

  useEffect(() => {
    void load()
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current)
    }
  }, [load])

  useProctoSocket(
    practiceId,
    (event) => {
      if (event.event === "conversation_updated") {
        scheduleSoft()
        return
      }
      const incoming = event.booking as Record<string, unknown> | undefined
      setRows((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          event.event,
          incoming,
        )
        if (needsRefresh) scheduleSoft()
        return sortBookingsByWhen(next, "asc")
      })
    },
    scheduleSoft,
  )

  async function onStatus(id: string, status: string) {
    setBusyId(id)
    setLoadError("")
    const previous = rows.find((b) => b.id === id)?.status
    setRows((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b)),
    )
    const res = await proctoService.updateBookingStatus(id, status)
    setBusyId(null)
    if (res.status !== "successful") {
      if (previous) {
        setRows((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: previous } : b)),
        )
      }
      setLoadError(res.message || "Could not update status")
    }
  }

  const filtered = useMemo(
    () =>
      rows.filter((b) =>
        matchesQueueStatusFilter(b.status || "", statusFilter),
      ),
    [rows, statusFilter],
  )

  return (
    <>
      <DashboardPageHeader
        compact
        eyebrow={portal === "clinic" ? "Clinic" : "Doctor"}
        title="Appointments"
        subtitle={
          practiceName
            ? `${practiceName} · filter and update visit status`
            : "Live clinic bookings — filter by status"
        }
        action={
          <Link
            href={portal === "clinic" ? "/clinic/queue" : "/doctor/calendar"}
            className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            {portal === "clinic" ? "Open queue" : "Open calendar"}
          </Link>
        }
      />

      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={rows.map((b) => b.status)}
        className="border-b border-slate-200 pb-3 dark:border-white/10"
      />

      {loadError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm font-semibold text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-600">
          <p className="text-base font-semibold text-neutral-700 dark:text-neutral-200">
            No appointments match this status filter.
          </p>
          <Link
            href={portal === "clinic" ? "/clinic/queue" : "/doctor/calendar"}
            className="mt-3 inline-block text-sm font-bold text-[var(--theme-primary)] hover:underline"
          >
            {portal === "clinic" ? "View queue →" : "View calendar →"}
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2 md:hidden">
            {filtered.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border border-neutral-300 bg-white p-4 dark:border-neutral-600 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <PatientNameHover
                      booking={b}
                      className="truncate font-semibold text-neutral-900 dark:text-white"
                    />
                    <p className="text-xs text-neutral-500">
                      {b.patientPhone || b.patient_phone || ""}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {formatBookingWhenDetailed(b)}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {b.disease || b.consultationType || "—"}
                </p>
                <div className="mt-3">
                  <BookingStatusControls
                    status={b.status || "SCHEDULED"}
                    busy={busyId === b.id}
                    compact
                    ariaLabel={`Update status for ${b.patientName || "patient"}`}
                    onChange={(status) => void onStatus(b.id, status)}
                  />
                </div>
                <Link
                  href={`/doctor/queue/${b.id}`}
                  className="mt-2 inline-block text-xs font-bold text-[var(--theme-primary)] hover:underline"
                >
                  Open visit →
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Update status</th>
                  <th className="px-4 py-3 text-right">Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold">
                      <PatientNameHover booking={b} />
                      <p className="text-xs font-medium opacity-60">
                        {b.patientPhone || b.patient_phone}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                      {formatBookingWhenDetailed(b)}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-3 text-xs">
                      {b.disease || b.consultationType || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusControls
                        status={b.status || "SCHEDULED"}
                        busy={busyId === b.id}
                        compact
                        ariaLabel={`Update status for ${b.patientName || "patient"}`}
                        onChange={(status) => void onStatus(b.id, status)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="text-xs font-bold text-[var(--theme-primary)] hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
