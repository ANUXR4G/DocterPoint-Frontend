"use client"

import { format, startOfToday } from "date-fns"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CoolKid } from "@/components"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  filterBookingsByDate,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"
import { firey } from "@/utils"
import {
  bookingStatusClass,
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusControls from "@/components/ui/procto/BookingStatusControls"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import PatientAvatar from "@/components/ui/procto/PatientAvatar"

type QueueBooking = ProctoBooking & {
  patientPhone?: string
  patient_phone?: string
  patientName?: string | null
  patient_name?: string | null
  notes?: string | null
  consultationType?: string | null
  consultation_type?: string | null
  disease?: string | null
  createdAt?: string
  created_at?: string
  providerId?: string
  provider?: { id: string; name: string | null; email?: string | null } | null
  location?: {
    name: string
    address: string
    city: string
  } | null
  patient?: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    gender: string | null
    address: string | null
    imgSrc?: string | null
    profession: string | null
    dateOfBirth: string | null
    contactNumber: string | null
    emergencyNumber: string | null
  } | null
}

function slotLabel(b: QueueBooking) {
  const start = b.slotStart ?? b.slot_start
  if (start) {
    return new Date(start).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  const token = b.tokenNumber ?? b.token_number
  if (token != null) return `#${token}`
  return "—"
}

function bookedOnParts(b: QueueBooking) {
  const raw = b.createdAt ?? b.created_at
  if (!raw) return { date: "—", time: "" }
  const d = new Date(raw)
  return {
    date: d.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }
}

function appointmentDateLabel(b: QueueBooking) {
  const start = b.slotStart ?? b.slot_start
  if (start) {
    return new Date(start).toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }
  const session = b.sessionDate ?? b.session_date
  if (session) {
    return new Date(session).toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }
  return "—"
}

function dash(value: string | null | undefined) {
  const v = value?.trim()
  return v ? v : "—"
}

function ageFromDob(dob?: string | null): string {
  if (!dob?.trim()) return "—"
  const age = firey.calculateAge(dob)
  return age >= 0 && age <= 130 ? String(age) : "—"
}

export default function DoctorQueue({
  compact = false,
  showFilters = false,
  initialProviderId = "",
  /** Clinic (and doctor) can set any visit status via dropdown */
  allowStatusControl = true,
}: {
  compact?: boolean
  /** Clinic hub: doctor + status filters */
  showFilters?: boolean
  initialProviderId?: string
  allowStatusControl?: boolean
} = {}) {
  const [today] = useState(() => startOfToday())
  const [date] = useState(() => new Date().toISOString().slice(0, 10))
  const {
    ready,
    loading,
    error,
    memberships,
    refresh,
    patchBooking,
    bookings: allBookings,
    isClinicAdmin,
    actorUserId,
  } = usePracticeDashboard()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [providerFilter, setProviderFilter] = useState(() => {
    if (initialProviderId) return initialProviderId
    return ""
  })
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")

  // Clinic-staff doctors default to (and stay on) their own queue.
  // Clinic admins honor ?doctor= deep links, then can switch to all.
  useEffect(() => {
    if (!ready) return
    if (!isClinicAdmin && actorUserId) {
      setProviderFilter(actorUserId)
      return
    }
    if (isClinicAdmin && initialProviderId) {
      setProviderFilter(initialProviderId)
    }
  }, [ready, isClinicAdmin, actorUserId, initialProviderId])

  const bookings = useMemo(
    () =>
      filterBookingsByDate(allBookings, date) as QueueBooking[],
    [allBookings, date],
  )

  const practiceId = memberships[0]?.practice.id
  const emptyShell = compact
    ? "flex min-h-48 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-sky-50/50 p-6 text-center dark:border-white/10 dark:bg-white/5"
    : "flex h-full min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-sky-50/50 p-10 text-center dark:border-white/10 dark:bg-white/5"

  async function onStatus(id: string, status: string) {
    setBusyId(id)
    const previous = allBookings.find((b) => b.id === id)?.status
    patchBooking(id, { status })
    const res = await proctoService.updateBookingStatus(id, status)
    setBusyId(null)
    if (res.status !== "successful") {
      if (previous) patchBooking(id, { status: previous })
    }
  }

  const showLoading = !ready && loading

  const doctors = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of bookings) {
      const id = b.provider?.id || b.providerId
      if (!id) continue
      map.set(id, b.provider?.name || b.provider?.email || "Doctor")
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [bookings])

  const filteredBookings = useMemo(
    () =>
      bookings.filter((b) => {
        if (
          providerFilter &&
          (b.provider?.id || b.providerId) !== providerFilter
        ) {
          return false
        }
        return matchesQueueStatusFilter(b.status, statusFilter)
      }),
    [bookings, statusFilter, providerFilter],
  )

  const counts = useMemo(() => {
    const scoped = providerFilter
      ? bookings.filter(
          (b) => (b.provider?.id || b.providerId) === providerFilter,
        )
      : bookings
    return {
      all: scoped.length,
      statuses: scoped.map((b) => b.status),
    }
  }, [bookings, providerFilter])

  const activeCount = useMemo(
    () =>
      bookings.filter(
        (b) => !["CANCELED", "COMPLETED", "NO_SHOW"].includes(b.status),
      ).length,
    [bookings],
  )

  if (showLoading) {
    return (
      <div
        role="status"
        className={
          compact
            ? "min-h-48 animate-pulse rounded-2xl bg-gray-300/75 dark:bg-neutral-700/75"
            : "h-full min-h-64 animate-pulse rounded-2xl bg-gray-300/75 dark:bg-neutral-700/75"
        }
      >
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (error && !bookings.length) {
    return (
      <div
        className={
          compact
            ? "flex min-h-48 items-start rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "flex h-full min-h-64 items-start rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        }
      >
        <div>
          {error}
          <button
            type="button"
            className="mt-3 block underline"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!memberships.length) {
    return (
      <div className={emptyShell}>
        <p className="text-sm font-medium opacity-80">
          No practice linked to this account.
        </p>
        <Link
          href="/doctor/onboard"
          className="mt-4 inline-block text-sm font-semibold text-blue-600 underline dark:text-sky-400"
        >
          Set up practice / doctors
        </Link>
      </div>
    )
  }

  if (!bookings.length) {
    return (
      <div className={emptyShell}>
        <CoolKid className="mb-4 h-28 w-28 opacity-80" />
        <p className="text-sm font-medium opacity-80">
          No visits scheduled for {format(today, "MMM d, yyyy")}.
        </p>
        <Link
          href={practiceTabHref("calendar")}
          className="mt-4 inline-block text-sm font-semibold text-blue-600 underline dark:text-sky-400"
        >
          Open practice calendar
        </Link>
      </div>
    )
  }

  return (
    <div
      className={
        compact ? "space-y-3" : "flex h-full min-h-0 flex-col gap-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-semibold text-neutral-900 dark:text-white">
            {activeCount}
          </span>{" "}
          active · {format(today, "EEE, MMM d")}
        </p>
        {error ? (
          <p className="text-xs font-medium text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:flex-wrap sm:items-center">
        {isClinicAdmin && (showFilters || doctors.length > 1) ? (
          <label className="text-sm">
            <span className="sr-only">Doctor</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm dark:border-neutral-600 dark:bg-neutral-900"
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!isClinicAdmin && actorUserId ? (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Showing your appointments (clinic can view the full roster)
          </p>
        ) : null}
        <BookingStatusFilterBar
          value={statusFilter}
          onChange={setStatusFilter}
          statuses={counts.statuses}
        />
      </div>

      <div
        className={
          compact
            ? "max-h-[min(52vh,480px)] overflow-auto rounded-2xl border border-slate-200 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)]"
            : "min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)]"
        }
      >
        <ul className="divide-y divide-neutral-200 md:hidden dark:divide-neutral-700">
          {filteredBookings.map((b) => {
            const p = b.patient
            const name =
              p?.name || b.patientName || b.patient_name || "Unknown"
            const when = `${appointmentDateLabel(b)} · ${slotLabel(b)}`

            return (
              <li
                key={b.id}
                className="flex flex-col gap-2 bg-white px-3 py-3 dark:bg-neutral-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <PatientAvatar
                      name={name}
                      imgSrc={p?.imgSrc}
                      size="md"
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900 dark:text-white">
                        {name}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                        {when}
                        {b.provider?.name ? ` · ${b.provider.name}` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${bookingStatusClass(b.status)}`}
                  >
                    {bookingStatusLabel(b.status)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <BookingStatusControls
                    status={b.status}
                    busy={busyId === b.id}
                    showSelect={allowStatusControl}
                    compact
                    ariaLabel={`Status for ${name}`}
                    onChange={(status) => void onStatus(b.id, status)}
                  />
                  <Link
                    href={`/doctor/queue/${b.id}`}
                    className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--theme-primary)] hover:underline"
                  >
                    Open visit →
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="hidden md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-20 bg-neutral-100 text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Booked on
                </th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Appt date
                </th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Time
                </th>
                <th className="min-w-[140px] px-3 py-3 font-semibold">Name</th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Number
                </th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Age
                </th>
                <th className="min-w-[120px] px-3 py-3 font-semibold">Doctor</th>
                <th className="min-w-[120px] px-3 py-3 font-semibold">
                  Disease
                </th>
                <th className="whitespace-nowrap px-3 py-3 font-semibold">
                  Status
                </th>
                <th className="sticky right-0 z-30 whitespace-nowrap border-l border-neutral-200 bg-neutral-100 px-3 py-3 font-semibold dark:border-neutral-700 dark:bg-neutral-800">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredBookings.map((b) => {
                const p = b.patient
                const phone =
                  p?.contactNumber ||
                  p?.phone ||
                  b.patientPhone ||
                  b.patient_phone ||
                  "—"
                const name =
                  p?.name || b.patientName || b.patient_name || "Unknown"
                const disease =
                  b.disease ||
                  b.consultationType ||
                  b.consultation_type ||
                  b.notes ||
                  null
                const booked = bookedOnParts(b)
                const age = ageFromDob(p?.dateOfBirth)

                return (
                  <tr
                    key={b.id}
                    className="bg-white dark:bg-neutral-900/40"
                  >
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-xs">
                      <p>{booked.date}</p>
                      <p className="opacity-60">{booked.time}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle">
                      {appointmentDateLabel(b)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle font-medium">
                      {slotLabel(b)}
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="mt-0.5 block text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                      >
                        Open visit →
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <PatientAvatar
                          name={name}
                          imgSrc={p?.imgSrc}
                          size="sm"
                        />
                        <p className="font-medium">{name}</p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle">
                      {phone}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle">
                      {age}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {dash(b.provider?.name ?? undefined)}
                    </td>
                    <td className="max-w-[180px] px-3 py-3 align-middle text-sm">
                      {disease ? (
                        <p className="line-clamp-2 font-medium">{disease}</p>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${bookingStatusClass(b.status)}`}
                      >
                        {bookingStatusLabel(b.status)}
                      </span>
                    </td>
                    <td className="sticky right-0 z-10 min-w-[260px] border-l border-neutral-200 bg-white px-3 py-3 align-middle dark:border-neutral-700 dark:bg-neutral-900">
                      <div className="flex flex-wrap items-center gap-2">
                        <BookingStatusControls
                          status={b.status}
                          busy={busyId === b.id}
                          showSelect={allowStatusControl}
                          ariaLabel={`Actions for ${name}`}
                          onChange={(status) => void onStatus(b.id, status)}
                        />
                        <Link
                          href={`/doctor/queue/${b.id}`}
                          className="min-h-11 inline-flex items-center rounded-lg px-2 text-sm font-semibold text-[var(--theme-primary)] underline-offset-2 hover:underline"
                        >
                          Visit
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
