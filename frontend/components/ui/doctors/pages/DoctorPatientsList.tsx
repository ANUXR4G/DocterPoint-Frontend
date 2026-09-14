"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react"
import Link from "next/link"
import { firey } from "@/utils"
import { proctoService } from "@/lib/services/procto"
import { useProctoSocket } from "@/hooks/useProctoSocket"
import {
  bookingStatusClass,
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"

type PracticePatient = {
  phone: string
  name: string | null
  patientId: string | null
  email?: string | null
  gender?: string | null
  address?: string | null
  profession?: string | null
  dateOfBirth?: string | null
  bookingCount: number
  lastVisitAt: string | null
  lastStatus: string | null
  providerNames: string[]
  recentBookings: Array<{
    id: string
    status: string
    disease?: string | null
    consultationType?: string | null
    notes?: string | null
    doctorRemarks?: string | null
    slotStart?: string | null
    sessionDate?: string | null
    createdAt?: string
  }>
}

type Membership = {
  role: string
  practice: { id: string; name: string }
}

function ageFromDob(dob?: string | null): string {
  if (!dob?.trim()) return "—"
  const age = firey.calculateAge(dob)
  return age >= 0 && age <= 130 ? String(age) : "—"
}

function statusClass(status: string): string {
  return bookingStatusClass(status)
}

function genderTone(gender?: string | null) {
  const g = (gender || "").toLowerCase()
  if (g === "female") {
    return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200"
  }
  if (g === "male") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
  }
  if (g === "others" || g === "other") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
  }
  return "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
}

function genderLabel(gender?: string | null) {
  const g = (gender || "").toLowerCase()
  if (g === "male") return "Male"
  if (g === "female") return "Female"
  if (g === "others" || g === "other") return "Others"
  return "Not set"
}

function diseaseOf(p: PracticePatient) {
  const latest = p.recentBookings?.[0]
  return (
    latest?.disease ||
    latest?.consultationType ||
    latest?.notes ||
    "—"
  )
}

export default function DoctorPatientsList() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [patients, setPatients] = useState<PracticePatient[]>([])
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [practiceName, setPracticeName] = useState("")
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError("")
    }
    const mine = await proctoService.getMyPractices()
    if (
      mine.status !== "successful" ||
      !Array.isArray(mine.data) ||
      !mine.data.length
    ) {
      setPatients([])
      setPracticeId(null)
      setPracticeName("")
      if (!opts?.silent) {
        setLoading(false)
        if (mine.status !== "successful") {
          setError(mine.message || "Could not load practice.")
        }
      }
      return
    }

    const memberships = mine.data as Membership[]
    const practice = memberships[0]?.practice
    if (!practice?.id) {
      setPatients([])
      setPracticeId(null)
      if (!opts?.silent) setLoading(false)
      return
    }

    setPracticeId(practice.id)
    setPracticeName(practice.name)
    const list = await proctoService.listPracticePatients(practice.id)
    if (list.status === "successful" && Array.isArray(list.data)) {
      setPatients(list.data as PracticePatient[])
      if (!opts?.silent) setError("")
    } else if (!opts?.silent) {
      setPatients([])
      setError(list.message || "Could not load patients.")
    }
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

  useProctoSocket(practiceId, scheduleSoft, scheduleSoft)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patients.filter((p) => {
      if (!matchesQueueStatusFilter(p.lastStatus || "", statusFilter)) {
        return false
      }
      if (!q) return true
      const hay = [
        p.name,
        p.email,
        p.phone,
        p.profession,
        p.gender,
        p.address,
        diseaseOf(p),
        ...(p.providerNames ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [patients, query, statusFilter])

  if (loading) {
    return (
      <div
        role="status"
        className="h-80 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-200/70 dark:border-neutral-700 dark:bg-neutral-800/80"
      >
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (error && !patients.length) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {error}
        <button
          type="button"
          className="mt-3 block underline"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!practiceName) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm dark:border-neutral-600 dark:bg-neutral-900">
        <p className="font-medium opacity-80">No practice linked yet.</p>
        <Link
          href="/doctor/onboard"
          className="mt-3 inline-block text-sm font-semibold text-[var(--theme-primary)] underline"
        >
          Set up practice / doctors
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base font-bold text-neutral-900 dark:text-white">
          {practiceName} · {filtered.length} patient
          {filtered.length === 1 ? "" : "s"} from clinic bookings
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, disease…"
          className="form-input w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm dark:border-neutral-600 sm:max-w-xs"
        />
      </div>

      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={patients.map((p) => p.lastStatus)}
        className="mb-4"
        ariaLabel="Filter patients by last visit status"
      />

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900/40 dark:shadow-none">
          <ul className="divide-y divide-neutral-200 md:hidden dark:divide-neutral-700">
            {filtered.map((p) => {
              const open = expanded === p.phone
              return (
                <li key={p.phone} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {p.name || "Unknown"}
                      </p>
                      <p className="mt-0.5 text-sm font-medium">
                        {p.phone || "—"}
                      </p>
                      <p className="mt-1 text-xs opacity-60">
                        {p.bookingCount} visit
                        {p.bookingCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {p.lastStatus ? (
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${statusClass(p.lastStatus)}`}
                      >
                        {bookingStatusLabel(p.lastStatus)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs opacity-50">—</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.phone)}
                    className="mt-2 text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                  >
                    {open ? "Hide details" : "View details"}
                  </button>
                  {open ? (
                    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950/40">
                      <div className="grid gap-2 text-xs">
                        <p>
                          <span className="opacity-50">Address: </span>
                          {p.address || "—"}
                        </p>
                        <p>
                          <span className="opacity-50">Seen by: </span>
                          {p.providerNames?.join(", ") || "—"}
                        </p>
                        <p>
                          <span className="opacity-50">DOB: </span>
                          {p.dateOfBirth || "—"}
                        </p>
                        <p>
                          <span className="opacity-50">Last visit: </span>
                          {p.lastVisitAt
                            ? new Date(p.lastVisitAt).toLocaleString()
                            : "—"}
                        </p>
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-50">
                        Recent visits
                      </p>
                      <ul className="mt-2 space-y-2">
                        {(p.recentBookings ?? []).map((b) => (
                          <li
                            key={b.id}
                            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">
                                {b.disease || b.consultationType || "Visit"}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(b.status)}`}
                              >
                                {bookingStatusLabel(b.status)}
                              </span>
                            </div>
                            <p className="mt-0.5 opacity-60">
                              {b.slotStart
                                ? new Date(b.slotStart).toLocaleString()
                                : b.sessionDate
                                  ? String(b.sessionDate).slice(0, 10)
                                  : b.createdAt
                                    ? new Date(b.createdAt).toLocaleDateString()
                                    : "—"}
                            </p>
                            {b.doctorRemarks ? (
                              <p className="mt-1 opacity-80">
                                Remarks: {b.doctorRemarks}
                              </p>
                            ) : null}
                            <Link
                              href={`/doctor/queue/${b.id}`}
                              className="mt-1 inline-block font-semibold text-[var(--theme-primary)] hover:underline"
                            >
                              Open visit →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="whitespace-nowrap px-4 py-3">Number</th>
                  <th className="whitespace-nowrap px-4 py-3">Age</th>
                  <th className="whitespace-nowrap px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Disease</th>
                  <th className="whitespace-nowrap px-4 py-3">Visits</th>
                  <th className="whitespace-nowrap px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((p) => {
                  const open = expanded === p.phone
                  return (
                    <Fragment key={p.phone}>
                      <tr className="bg-white dark:bg-neutral-900/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white">
                              {(p.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {p.name || "Unknown"}
                              </p>
                              <p className="truncate text-xs opacity-60">
                                {p.email || p.profession || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {p.phone || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {ageFromDob(p.dateOfBirth)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${genderTone(p.gender)}`}
                          >
                            {genderLabel(p.gender)}
                          </span>
                        </td>
                        <td className="max-w-[180px] px-4 py-3">
                          <p className="line-clamp-2 font-medium">
                            {diseaseOf(p)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {p.bookingCount}
                        </td>
                        <td className="px-4 py-3">
                          {p.lastStatus ? (
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${statusClass(p.lastStatus)}`}
                            >
                              {bookingStatusLabel(p.lastStatus)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded(open ? null : p.phone)
                            }
                            className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                          >
                            {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-neutral-50 dark:bg-neutral-950/40">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid gap-3 text-xs sm:grid-cols-2">
                              <p>
                                <span className="opacity-50">Address: </span>
                                {p.address || "—"}
                              </p>
                              <p>
                                <span className="opacity-50">Seen by: </span>
                                {p.providerNames?.join(", ") || "—"}
                              </p>
                              <p>
                                <span className="opacity-50">DOB: </span>
                                {p.dateOfBirth || "—"}
                              </p>
                              <p>
                                <span className="opacity-50">Last visit: </span>
                                {p.lastVisitAt
                                  ? new Date(p.lastVisitAt).toLocaleString()
                                  : "—"}
                              </p>
                            </div>
                            <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-50">
                              Recent visits
                            </p>
                            <ul className="mt-2 space-y-2">
                              {(p.recentBookings ?? []).map((b) => (
                                <li
                                  key={b.id}
                                  className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium">
                                      {b.disease ||
                                        b.consultationType ||
                                        "Visit"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(b.status)}`}
                                    >
                                      {bookingStatusLabel(b.status)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 opacity-60">
                                    {b.slotStart
                                      ? new Date(b.slotStart).toLocaleString()
                                      : b.sessionDate
                                        ? String(b.sessionDate).slice(0, 10)
                                        : b.createdAt
                                          ? new Date(
                                              b.createdAt,
                                            ).toLocaleDateString()
                                          : "—"}
                                  </p>
                                  {b.doctorRemarks ? (
                                    <p className="mt-1 opacity-80">
                                      Remarks: {b.doctorRemarks}
                                    </p>
                                  ) : null}
                                  <Link
                                    href={`/doctor/queue/${b.id}`}
                                    className="mt-1 inline-block font-semibold text-[var(--theme-primary)] hover:underline"
                                  >
                                    Open visit →
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm font-medium text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          {query
            ? "No patients match your search."
            : "No clinic bookings yet. Patients appear here after they book."}
        </div>
      )}
    </>
  )
}
