"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { proctoService } from "@/lib/services/procto"
import {
  isTerminalVisitStatus,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import { formatBookingWhenDetailed } from "@/lib/bookingDisplay"
import { PatientNameHover } from "@/components/ui/procto/PatientBookingHover"
import BookingStatusControls from "@/components/ui/procto/BookingStatusControls"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import ClinicBookAppointmentModal from "@/components/ui/procto/ClinicBookAppointmentModal"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { formatPhoneDisplay } from "@/lib/formatPhone"

/** Clinic bookings from Procto — synced with backend queue/calendar. */
export default function DoctorAppointmentsList({
  portal = "doctor",
}: {
  portal?: "doctor" | "clinic"
} = {}) {
  const {
    ready,
    hydrated,
    loading,
    error: loadError,
    practiceName,
    bookings: rows,
    patchBooking,
    refresh,
  } = usePracticeDashboard()
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [bookOpen, setBookOpen] = useState(false)

  const showLoading = (!ready && loading) || (ready && !hydrated)
  const isClinic = portal === "clinic"

  async function onStatus(id: string, status: string) {
    const previous = rows.find((b) => b.id === id)?.status
    if (isTerminalVisitStatus(previous || "")) {
      setActionError("Completed appointments cannot change status.")
      return
    }
    setBusyId(id)
    setActionError("")
    patchBooking(id, { status })
    const res = await proctoService.updateBookingStatus(id, status)
    setBusyId(null)
    if (res.status !== "successful") {
      if (previous) patchBooking(id, { status: previous })
      setActionError(res.message || "Could not update status")
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
        eyebrow={isClinic ? "Clinic" : "Doctor"}
        title="Appointments"
        subtitle={
          practiceName
            ? isClinic
              ? `All visits for ${practiceName} — book for any doctor or update patient status.`
              : `All visits for ${practiceName} (updates live).`
            : isClinic
              ? "Book visits for your doctors or update patient status."
              : "All visits (updates live)."
        }
        action={
          isClinic ? (
            <button
              type="button"
              className="dashboard-btn-primary"
              onClick={() => setBookOpen(true)}
            >
              Book appointment
            </button>
          ) : null
        }
      />

      {isClinic ? (
        <ClinicBookAppointmentModal
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          onBooked={() => {
            void refresh({ silent: true })
          }}
        />
      ) : null}

      {actionError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}

      {loadError && !rows.length ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {loadError}
        </p>
      ) : null}

      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={rows.map((b) => b.status)}
        className="mt-2"
      />

      {showLoading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No appointments in this filter.
          {isClinic ? (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold text-[var(--theme-primary)] hover:underline"
                onClick={() => setBookOpen(true)}
              >
                Book one now
              </button>
            </>
          ) : null}
        </p>
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
                      {formatPhoneDisplay(
                        b.patientPhone || b.patient_phone,
                        "",
                      )}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {formatBookingWhenDetailed(b)}
                </p>
                <div className="mt-3">
                  <BookingStatusControls
                    status={b.status || "SCHEDULED"}
                    busy={busyId === b.id}
                    compact
                    showActionButtons={false}
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

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-[var(--solune-elevated)] dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold">
                      <PatientNameHover booking={b} />
                      <p className="text-xs font-medium opacity-60">
                        {formatPhoneDisplay(
                          b.patientPhone || b.patient_phone,
                          "",
                        )}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                      {formatBookingWhenDetailed(b)}
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusControls
                        status={b.status || "SCHEDULED"}
                        busy={busyId === b.id}
                        compact
                        showActionButtons={false}
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
