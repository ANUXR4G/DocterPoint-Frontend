"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  bookingStatusTone,
  formatBookingStatus,
} from "@/lib/bookingStatusTone"
import {
  formatBookingWhenDetailed,
} from "@/lib/bookingDisplay"
import { usePatientDashboard } from "@/contexts/PatientDashboardContext"

type PatientBooking = ProctoBooking & {
  doctorRemarks?: string | null
  medicines?: Array<{ name: string; amount?: string; times?: string[] }> | null
  documents?: Array<{ name: string; url: string }> | null
  createdAt?: string | null
  created_at?: string | null
  provider?: {
    id: string
    name: string | null
    email?: string | null
    phone?: string | null
    licenseNo?: string | null
    description?: string | null
    experience?: number | null
  } | null
}

function formatWhen(booking: PatientBooking) {
  return formatBookingWhenDetailed(booking)
}

function bookedOnLabel(booking: PatientBooking) {
  const raw = booking.createdAt ?? booking.created_at
  if (!raw) return "—"
  return new Date(raw).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—"
}

function canCancelStatus(status: string) {
  const s = (status || "").toUpperCase()
  return (
    s === "SCHEDULED" ||
    s === "REQUESTED" ||
    s === "ACCEPTED" ||
    s === "BOOKED" ||
    s === "CONFIRMED"
  )
}

export default function MyBookings() {
  const router = useRouter()
  const {
    bookings: rawBookings,
    loading,
    ready,
    error: loadError,
    refresh,
  } = usePatientDashboard()
  const bookings = rawBookings as PatientBooking[]
  const showLoading = !ready && loading

  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  async function cancel(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (
      !window.confirm(
        "Cancel this appointment? The clinic will be notified.",
      )
    ) {
      return
    }
    const reason =
      window.prompt(
        "Optional: reason for canceling (shown to the clinic)",
        "",
      ) ?? undefined
    setBusyId(id)
    setFlash(null)
    const res = await proctoService.cancelBooking(
      id,
      undefined,
      reason?.trim() || undefined,
    )
    setBusyId(null)
    if (res.status === "successful") {
      await refresh({ silent: true })
      setFlash({ tone: "ok", text: "Appointment canceled." })
    } else {
      setFlash({ tone: "err", text: res.message ?? "Cancel failed." })
    }
  }

  function openVisit(id: string) {
    router.push(`/patient/bookings/${id}`)
  }

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Patient"
        title={
          <>
            My{" "}
            <span className="text-blue-600 dark:text-sky-400">bookings</span>
          </>
        }
        subtitle="Your clinic appointments — open a row for visit details, medicines, and documents."
        action={
          <Link
            href="/practices"
            className="inline-flex h-11 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Book another
          </Link>
        }
      />

      {flash ? (
        <p
          className={`mb-4 text-sm ${
            flash.tone === "ok"
              ? "text-green-700 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {flash.text}
        </p>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {showLoading && bookings.length === 0 ? (
        <div
          role="status"
          className="dashboard-panel h-64 animate-pulse !bg-slate-100 dark:!bg-slate-800"
        >
          <span className="sr-only">Loading…</span>
        </div>
      ) : null}

      {!showLoading && !loadError && bookings.length === 0 ? (
        <div className="dashboard-panel flex min-h-[12rem] flex-col items-center justify-center border-dashed text-center">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No online bookings yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Find a clinic and book a slot or token.
          </p>
          <Link
            href="/practices"
            className="mt-5 inline-flex h-11 items-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Find clinics
          </Link>
        </div>
      ) : null}

      {bookings.length > 0 ? (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {bookings.map((b) => {
              const canCancel = canCancelStatus(b.status)
              return (
                <li
                  key={b.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openVisit(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      openVisit(b.id)
                    }
                  }}
                  className="dashboard-insight-card cursor-pointer !min-h-0 !p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {formatWhen(b)}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        Booked {bookedOnLabel(b)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${bookingStatusTone(b.status)}`}
                    >
                      {formatBookingStatus(b.status)}
                    </span>
                  </div>
                  <div className="mt-3 min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">
                      {b.practice?.name ?? "Practice"}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {dash(b.provider?.name)}
                    </p>
                  </div>
                  <div
                    className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link
                      href={`/patient/bookings/${b.id}`}
                      className="text-xs font-semibold text-blue-600 hover:underline dark:text-sky-400"
                    >
                      View visit →
                    </Link>
                    {canCancel ? (
                      <button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={(e) => void cancel(e, b.id)}
                        className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        {busyId === b.id ? "Canceling…" : "Cancel"}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Desktop table */}
          <div className="dashboard-panel hidden overflow-x-auto !p-0 md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-sky-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                <tr>
                  <th className="h-12 whitespace-nowrap px-3 font-semibold">
                    Booked on
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    When
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Clinic
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Doctor
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Location
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Mode
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Channel
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">
                    Status
                  </th>
                  <th className="sticky right-0 whitespace-nowrap bg-sky-50 px-3 py-3 font-semibold dark:bg-slate-800/80">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {bookings.map((b) => {
                  const canCancel = canCancelStatus(b.status)
                  return (
                    <tr
                      key={b.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openVisit(b.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          openVisit(b.id)
                        }
                      }}
                      className="cursor-pointer bg-white align-top transition hover:bg-sky-50/50 dark:bg-slate-900/40 dark:hover:bg-slate-800/60"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-xs">
                        {bookedOnLabel(b)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold">
                        {formatWhen(b)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">
                          {b.practice?.name ?? "Practice"}
                        </p>
                        <p className="text-xs opacity-60">
                          {dash(b.practice?.specialty)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{dash(b.provider?.name)}</p>
                        {b.provider?.licenseNo ? (
                          <p className="text-xs opacity-60">
                            Lic. {b.provider.licenseNo}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {b.location
                          ? `${b.location.name}, ${b.location.city}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {b.mode?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {b.channel?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${bookingStatusTone(b.status)}`}
                        >
                          {formatBookingStatus(b.status)}
                        </span>
                      </td>
                      <td
                        className="sticky right-0 bg-white px-3 py-3 dark:bg-slate-900"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex min-w-[120px] flex-col gap-1.5">
                          <Link
                            href={`/patient/bookings/${b.id}`}
                            className="text-xs font-semibold text-blue-600 hover:underline dark:text-sky-400"
                          >
                            View visit →
                          </Link>
                          {canCancel ? (
                            <button
                              type="button"
                              disabled={busyId === b.id}
                              onClick={(e) => void cancel(e, b.id)}
                              className="text-left text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                            >
                              {busyId === b.id ? "Canceling…" : "Cancel"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
