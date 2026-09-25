"use client"

import Link from "next/link"
import {
  usePracticeDashboard,
  filterBookingsByDate,
  type PracticePatientRow,
} from "@/contexts/PracticeDashboardContext"
import PracticeNotificationsPanel from "@/components/ui/procto/PracticeNotificationsPanel"
import {
  bookingStatusClass,
  bookingStatusLabel,
} from "@/lib/bookingStatus"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import {
  formatPracticeDateTime,
  practiceTodayIso,
} from "@/lib/practiceTime"
import { sortBookingsByWhen } from "@/lib/bookingDisplay"
import type { ProctoBooking } from "@/lib/services/procto"

function patientName(b: ProctoBooking) {
  return (
    b.patientName ||
    b.patient_name ||
    b.patient?.name ||
    "Patient"
  )
}

function patientPhone(b: ProctoBooking) {
  return b.patientPhone || b.patient_phone || b.patient?.phone || ""
}

function whenLabel(b: ProctoBooking) {
  const slot = b.slotStart ?? b.slot_start
  if (slot) return formatPracticeDateTime(slot)
  const session = b.sessionDate ?? b.session_date
  const token = b.tokenNumber ?? b.token_number
  if (session) {
    const tok = token != null ? ` · Token #${token}` : ""
    return `${String(session).slice(0, 10)}${tok}`
  }
  return "—"
}

function patientsWithDocs(patients: PracticePatientRow[]) {
  return patients.filter(
    (p) => Array.isArray(p.attachments) && p.attachments.some((d) => d?.url),
  )
}

/**
 * Single-page live hub: alerts + today's visits + patient documents.
 * Built for clinic demos — everything the doctor needs without hopping tabs.
 */
export default function DoctorActivityHub() {
  const dash = usePracticeDashboard()
  const today = practiceTodayIso()
  const todayBookings = sortBookingsByWhen(
    filterBookingsByDate(dash.bookings, today),
  )
  const withDocs = patientsWithDocs(dash.patients)

  const counts = {
    total: todayBookings.length,
    waiting: todayBookings.filter((b) =>
      ["WAITING", "CHECKED_IN"].includes(String(b.status || "").toUpperCase()),
    ).length,
    inProgress: todayBookings.filter(
      (b) => String(b.status || "").toUpperCase() === "IN_PROGRESS",
    ).length,
    completed: todayBookings.filter(
      (b) => String(b.status || "").toUpperCase() === "COMPLETED",
    ).length,
    canceled: todayBookings.filter((b) =>
      ["CANCELED", "CANCELLED"].includes(String(b.status || "").toUpperCase()),
    ).length,
    docs: withDocs.length,
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
            dash.liveConnected
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              dash.liveConnected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {dash.liveConnected ? "Live" : "Connecting…"}
        </span>
        <button
          type="button"
          onClick={() => void dash.refresh({ silent: true })}
          className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
        <Link
          href="/doctor/queue"
          className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Open queue
        </Link>
        <Link
          href="/doctor/patients"
          className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Patients
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Today", value: counts.total },
          { label: "Waiting", value: counts.waiting },
          { label: "In progress", value: counts.inProgress },
          { label: "Completed", value: counts.completed },
          { label: "Canceled", value: counts.canceled },
          { label: "With documents", value: counts.docs },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              {card.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="dashboard-section-title">Every change (alerts)</h2>
          <p className="dashboard-section-sub">
            New booking, cancel, reschedule, waiting, no-show, completed,
            documents — tap a row to clear
          </p>
        </div>
        <PracticeNotificationsPanel />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="dashboard-section-title">Today&apos;s visits</h2>
            <p className="dashboard-section-sub">
              All appointments for {today} (practice timezone)
            </p>
          </div>
          <Link
            href="/doctor/queue"
            className="text-sm font-semibold text-[var(--theme-primary)] hover:underline"
          >
            Manage queue →
          </Link>
        </div>
        {!dash.hydrated ? (
          <p className="text-sm text-neutral-500">Loading visits…</p>
        ) : todayBookings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No visits scheduled for today.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900/80">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {todayBookings.map((b) => (
                  <tr
                    key={b.id}
                    className="bg-white dark:bg-neutral-950/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {whenLabel(b)}
                    </td>
                    <td className="px-4 py-3">{patientName(b)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {formatPhoneDisplay(patientPhone(b))}
                    </td>
                    <td className="px-4 py-3 opacity-80">
                      {b.provider?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs uppercase opacity-60">
                      {String(b.channel || "—").replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${bookingStatusClass(b.status)}`}
                      >
                        {bookingStatusLabel(b.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                      >
                        Visit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="dashboard-section-title">Patient documents</h2>
            <p className="dashboard-section-sub">
              General Documents shared by patients (WhatsApp / portal)
            </p>
          </div>
          <Link
            href="/doctor/patients"
            className="text-sm font-semibold text-[var(--theme-primary)] hover:underline"
          >
            All patients →
          </Link>
        </div>
        {!dash.hydrated ? (
          <p className="text-sm text-neutral-500">Loading patients…</p>
        ) : withDocs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No patient documents yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withDocs.slice(0, 24).map((p, i) => (
              <li
                key={`${p.patientId || p.phone}-${i}`}
                className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60"
              >
                <p className="font-semibold text-neutral-900 dark:text-white">
                  {p.name || "Patient"}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                  {p.mrn?.trim() || "—"} · {formatPhoneDisplay(p.phone)}
                </p>
                <ul className="mt-3 space-y-1">
                  {(p.attachments || [])
                    .filter((d) => d?.url)
                    .map((doc) => (
                      <li key={`${doc.url}-${doc.name}`}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                        >
                          {doc.name}
                        </a>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
