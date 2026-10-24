"use client"

import { useEffect, useMemo, useState, Fragment } from "react"
import Link from "next/link"
import { Paperclip } from "lucide-react"
import TablePagination from "@/components/pagination/TablePagination"
import { useClientPagination } from "@/hooks/useClientPagination"
import { firey } from "@/utils"
import {
  usePracticeDashboard,
  type PracticePatientRow,
} from "@/contexts/PracticeDashboardContext"
import { proctoService } from "@/lib/services/procto"
import {
  bookingStatusClass,
  bookingStatusLabel,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import PatientAvatar from "@/components/ui/procto/PatientAvatar"
import PatientDocumentsModal from "@/components/ui/procto/PatientDocumentsModal"
import { chartSummaryLines } from "@/lib/clinicalMasters"
import { withDrTitle } from "@/lib/doctorName"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { formatPracticeDateTime } from "@/lib/practiceTime"

type PracticePatient = PracticePatientRow & {
  recentBookings: Array<{
    id: string
    status: string
    disease?: string | null
    consultationType?: string | null
    notes?: string | null
    doctorRemarks?: string | null
    medicines?: Array<{ name?: string; amount?: string }> | null
    clinicalAssessment?: unknown
    slotStart?: string | null
    sessionDate?: string | null
    createdAt?: string
    patientName?: string | null
    patientPhone?: string | null
    providerName?: string | null
    provider?: { name?: string | null } | null
  }>
}

function visitWhen(b: PracticePatient["recentBookings"][number]): string {
  const when = b.slotStart
    ? formatPracticeDateTime(b.slotStart)
    : b.sessionDate
      ? String(b.sessionDate).slice(0, 10)
      : b.createdAt
        ? formatPracticeDateTime(b.createdAt)
        : "—"
  const doctor = withDrTitle(b.provider?.name || b.providerName)
  return [when, doctor].filter(Boolean).join(" · ")
}

function ageFromDob(dob?: string | null, age?: number | null): string {
  if (typeof age === "number" && age >= 0 && age <= 130) return String(age)
  if (!dob?.trim()) return "—"
  const n = firey.calculateAge(dob)
  return n >= 0 && n <= 130 ? String(n) : "—"
}

type PatientAttachment = {
  name: string
  url: string
  uploadedAt?: string
}

function patientAttachments(p: PracticePatientRow): PatientAttachment[] {
  return Array.isArray(p.attachments) ? p.attachments.filter((d) => d?.url) : []
}

function VisitChartLines({
  booking,
}: {
  booking: PracticePatient["recentBookings"][number]
}) {
  const lines = chartSummaryLines(booking.clinicalAssessment, booking.medicines)
  const rows = [
    ["Vitals", lines.vitals],
    ["Allergies", lines.allergies],
    ["Pain", lines.pain],
    ["Prescription", lines.prescription],
  ] as const
  return (
    <dl className="mt-2 space-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="inline font-semibold">{label}: </dt>
          <dd className="inline">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AttachmentsIconButton({
  attachments,
  patientName,
  onOpen,
}: {
  attachments: PatientAttachment[]
  patientName?: string | null
  onOpen: () => void
}) {
  const count = attachments.length
  const label = count
    ? `View ${count} document${count === 1 ? "" : "s"} for ${patientName?.trim() || "patient"}`
    : `No documents for ${patientName?.trim() || "patient"}`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={`relative inline-flex size-9 items-center justify-center rounded-xl border transition ${
        count
          ? "border-[var(--theme-primary)]/25 bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/15"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
      }`}
    >
      <Paperclip className="size-4" aria-hidden />
      {count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--theme-primary)] px-1 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  )
}

function patientRowKey(p: PracticePatientRow, index = 0) {
  // Identity is member name + booking number (patientId may be shared).
  const phone = p.bookedViaPhone || p.phone || ""
  const name = (p.name || "").trim().toLowerCase() || "unknown"
  return `${phone}|${name}|${index}`
}

function bookedViaPhone(p: PracticePatientRow) {
  return p.bookedViaPhone || p.phone
}

function statusClass(status: string): string {
  return bookingStatusClass(status)
}

function viaLabel(p: PracticePatientRow) {
  return p.bookingCount > 0 ? "Booked via" : "Phone"
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

export default function DoctorPatientsList() {
  const {
    ready,
    hydrated,
    loading,
    error,
    practiceName,
    practiceId: contextPracticeId,
    patients,
    refresh,
  } = usePracticeDashboard()
  const practiceId = contextPracticeId ?? ""
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [docsPatient, setDocsPatient] = useState<PracticePatientRow | null>(
    null,
  )
  const [canViewHistory, setCanViewHistory] = useState(true)
  const [canArchive, setCanArchive] = useState(false)
  const [canMerge, setCanMerge] = useState(false)
  const [mergeSurvivorId, setMergeSurvivorId] = useState<string | null>(null)
  const [permBusy, setPermBusy] = useState("")

  useEffect(() => {
    let alive = true
    if (!practiceId) return
    void proctoService.getMyPracticePermissions(practiceId).then((res) => {
      if (!alive || res.status !== "successful" || !res.data?.permissions) return
      const p = res.data.permissions
      setCanViewHistory(
        Boolean(p.VIEW_PATIENT_HISTORY || p.OPEN_PATIENT_DOCS),
      )
      setCanArchive(Boolean(p.DELETE_PATIENT))
      setCanMerge(Boolean(p.MERGE_PATIENT))
    })
    return () => {
      alive = false
    }
  }, [practiceId])

  const showLoading = (!ready && loading) || (ready && !hydrated)

  async function archivePatient(patientUserId: string, name: string | null) {
    if (!practiceId || !patientUserId) return
    if (
      !window.confirm(
        `Archive ${name || "this patient"} from the clinic list? Past visits and MRN are kept.`,
      )
    ) {
      return
    }
    setPermBusy(patientUserId)
    try {
      const res = await proctoService.archivePracticePatient(
        practiceId,
        patientUserId,
      )
      if (res.status === "successful") void refresh()
      else window.alert(res.message || "Could not archive patient.")
    } finally {
      setPermBusy("")
    }
  }

  async function mergeIntoSurvivor(duplicateUserId: string) {
    if (!practiceId || !mergeSurvivorId || mergeSurvivorId === duplicateUserId) {
      return
    }
    if (
      !window.confirm(
        "Merge this duplicate into the selected survivor? Visits move to the survivor; the duplicate leaves the clinic list.",
      )
    ) {
      return
    }
    setPermBusy(duplicateUserId)
    try {
      const res = await proctoService.mergePracticePatients(
        practiceId,
        mergeSurvivorId,
        duplicateUserId,
      )
      if (res.status === "successful") {
        setMergeSurvivorId(null)
        void refresh()
      } else {
        window.alert(res.message || "Could not merge patients.")
      }
    } finally {
      setPermBusy("")
    }
  }

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
        p.bookedViaPhone,
        p.mrn,
        p.relationship,
        p.gender,
        p.address,
        ...(p.providerNames ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [patients, query, statusFilter])

  const listPagination = useClientPagination(filtered, {
    resetKey: `${statusFilter}:${query.trim().toLowerCase()}`,
  })

  if (showLoading) {
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
          onClick={() => void refresh()}
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
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-bold text-neutral-900 dark:text-white">
            {practiceName} · {filtered.length} patient
            {filtered.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Registration is the clinic link / account date and time. Different
            MRN prefixes are normal — each ID keeps the clinic that issued it
            (plain MR… is older, before clinic prefixes); renaming the clinic
            does not rewrite issued MRNs.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, disease…"
          className="form-input w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600 sm:max-w-xs"
        />
      </div>

      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={patients.map((p) => p.lastStatus)}
        className="mb-2 shrink-0"
        ariaLabel="Filter patients by last visit status"
      />

      {filtered.length > 0 ? (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] dark:shadow-none">
          <ul className="min-h-0 flex-1 divide-y divide-neutral-200 overflow-y-auto md:hidden dark:divide-neutral-700">
            {listPagination.pageItems.map((p, index) => {
              const absoluteIndex =
                (listPagination.page - 1) * listPagination.pageSize + index
              const key = patientRowKey(p, absoluteIndex)
              const open = expanded === key
              const via = formatPhoneDisplay(bookedViaPhone(p))
              return (
                <li key={key} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <PatientAvatar
                        name={p.name}
                        imgSrc={p.imgSrc}
                        size="md"
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {p.name || "Unknown"}
                        </p>
                        {p.relationship?.trim() ? (
                          <p className="mt-0.5 text-xs font-medium text-[var(--theme-primary)]">
                            {p.relationship.trim()}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-sm font-medium">
                          {viaLabel(p)} {via}
                        </p>
                        {p.mrn?.trim() ? (
                          <p className="mt-0.5 text-xs font-semibold tabular-nums tracking-wide opacity-70">
                            MRN {p.mrn.trim()}
                          </p>
                        ) : null}
                        {p.registeredAt ? (
                          <p className="mt-0.5 text-xs opacity-60">
                            Registered {formatPracticeDateTime(p.registeredAt)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs opacity-60">
                          {p.bookingCount} visit
                          {p.bookingCount === 1 ? "" : "s"}
                          {ageFromDob(p.dateOfBirth, p.age) !== "—"
                            ? ` · Age ${ageFromDob(p.dateOfBirth, p.age)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <AttachmentsIconButton
                        attachments={patientAttachments(p)}
                        patientName={p.name}
                        onOpen={() => setDocsPatient(p)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : key)}
                    className="mt-2 text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                  >
                    {open ? "Hide details" : "View details"}
                  </button>
                  {open ? (
                    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950/40">
                      <div className="grid gap-2 text-xs">
                        <p>
                          <span className="opacity-50">Member: </span>
                          {p.name || "—"}
                        </p>
                        {p.mrn?.trim() ? (
                          <p>
                            <span className="opacity-50">MRN: </span>
                            <span className="font-semibold tabular-nums">
                              {p.mrn.trim()}
                            </span>
                          </p>
                        ) : null}
                        <p>
                          <span className="opacity-50">{viaLabel(p)}: </span>
                          {via}
                        </p>
                        <p>
                          <span className="opacity-50">Registered: </span>
                          {p.registeredAt
                            ? formatPracticeDateTime(p.registeredAt)
                            : "—"}
                        </p>
                        {p.relationship?.trim() ? (
                          <p>
                            <span className="opacity-50">Relation: </span>
                            {p.relationship.trim()}
                          </p>
                        ) : null}
                        {p.address?.trim() ? (
                          <p>
                            <span className="opacity-50">Address: </span>
                            {p.address}
                          </p>
                        ) : null}
                        {p.providerNames?.length ? (
                          <p>
                            <span className="opacity-50">Seen by: </span>
                            {p.providerNames.join(", ")}
                          </p>
                        ) : null}
                        {p.dateOfBirth?.trim() ? (
                          <p>
                            <span className="opacity-50">DOB: </span>
                            {p.dateOfBirth}
                          </p>
                        ) : null}
                        {p.lastVisitAt ? (
                          <p>
                            <span className="opacity-50">Last visit: </span>
                            {formatPracticeDateTime(p.lastVisitAt)}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                          Attachments
                        </p>
                        <div className="mt-1.5">
                          <AttachmentsIconButton
                            attachments={patientAttachments(p)}
                            patientName={p.name}
                            onOpen={() => setDocsPatient(p)}
                          />
                        </div>
                      </div>
                      {p.patientId && (canArchive || canMerge) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canArchive ? (
                            <button
                              type="button"
                              disabled={permBusy === p.patientId}
                              onClick={() =>
                                void archivePatient(p.patientId!, p.name)
                              }
                              className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300"
                            >
                              Archive from clinic list
                            </button>
                          ) : null}
                          {canMerge ? (
                            mergeSurvivorId === p.patientId ? (
                              <button
                                type="button"
                                onClick={() => setMergeSurvivorId(null)}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                              >
                                Survivor selected — pick a duplicate
                              </button>
                            ) : mergeSurvivorId ? (
                              <button
                                type="button"
                                disabled={permBusy === p.patientId}
                                onClick={() => void mergeIntoSurvivor(p.patientId!)}
                                className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200"
                              >
                                Merge into survivor
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMergeSurvivorId(p.patientId!)}
                                className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200"
                              >
                                Mark as merge survivor
                              </button>
                            )
                          ) : null}
                        </div>
                      ) : null}
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
                                {canViewHistory &&
                                b.disease?.trim() &&
                                !/^general\s+consultation$/i.test(b.disease)
                                  ? b.disease
                                  : canViewHistory
                                    ? "No chief complaint"
                                    : "Visit"}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(b.status)}`}
                              >
                                {bookingStatusLabel(b.status)}
                              </span>
                            </div>
                            <p className="mt-0.5 opacity-60">{visitWhen(b)}</p>
                            {canViewHistory &&
                            b.doctorRemarks?.trim() &&
                            !/^Chief complaint:/i.test(b.doctorRemarks) &&
                            !/AI brief for doctor:/i.test(b.doctorRemarks) ? (
                              <p className="mt-1 whitespace-pre-wrap text-sm opacity-90">
                                <span className="font-semibold">Doctor Notes: </span>
                                {b.doctorRemarks}
                              </p>
                            ) : null}
                            {canViewHistory ? (
                              <VisitChartLines booking={b} />
                            ) : (
                              <p className="mt-1 text-xs text-neutral-500">
                                Medical history hidden — needs View Patient Medical History.
                              </p>
                            )}
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

          <div className="hidden min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto md:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                <tr>
                  <th className="w-[16%] px-3 py-1.5">Member</th>
                  <th className="w-[12%] px-3 py-1.5">MRN</th>
                  <th className="w-[14%] px-3 py-1.5">Registration</th>
                  <th className="w-[14%] px-3 py-1.5">Booked via</th>
                  <th className="w-[5%] px-3 py-1.5">Age</th>
                  <th className="w-[9%] px-3 py-1.5">Gender</th>
                  <th className="w-[6%] px-3 py-1.5">Visits</th>
                  <th className="w-[12%] px-3 py-1.5 text-center">
                    Attachments
                  </th>
                  <th className="w-[12%] px-3 py-1.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {listPagination.pageItems.map((p, index) => {
                  const absoluteIndex =
                    (listPagination.page - 1) * listPagination.pageSize + index
                  const key = patientRowKey(p, absoluteIndex)
                  const open = expanded === key
                  const via = formatPhoneDisplay(bookedViaPhone(p))
                  return (
                    <Fragment key={key}>
                      <tr className="bg-white dark:bg-neutral-900/40">
                        <td className="overflow-hidden px-3 py-1">
                          <div className="flex items-center gap-2">
                            <PatientAvatar
                              name={p.name}
                              imgSrc={p.imgSrc}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {p.name || "Unknown"}
                              </p>
                              {p.relationship?.trim() ? (
                                <p className="truncate text-xs font-medium text-[var(--theme-primary)]">
                                  {p.relationship.trim()}
                                </p>
                              ) : p.email ? (
                                <p className="truncate text-xs opacity-60">
                                  {p.email}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="overflow-hidden px-3 py-1 font-semibold tabular-nums tracking-wide">
                          <div className="truncate">{p.mrn?.trim() || "—"}</div>
                        </td>
                        <td className="overflow-hidden px-3 py-1 text-xs tabular-nums">
                          <div className="truncate">
                            {p.registeredAt
                              ? formatPracticeDateTime(p.registeredAt)
                              : "—"}
                          </div>
                        </td>
                        <td className="overflow-hidden px-3 py-1 font-medium">
                          <div className="truncate">{via}</div>
                        </td>
                        <td className="overflow-hidden px-3 py-1">
                          {ageFromDob(p.dateOfBirth, p.age)}
                        </td>
                        <td className="overflow-hidden px-3 py-1">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${genderTone(p.gender)}`}
                          >
                            {genderLabel(p.gender)}
                          </span>
                        </td>
                        <td className="overflow-hidden px-3 py-1">
                          {p.bookingCount}
                        </td>
                        <td className="overflow-hidden px-3 py-1 text-center align-middle">
                          <AttachmentsIconButton
                            attachments={patientAttachments(p)}
                            patientName={p.name}
                            onOpen={() => setDocsPatient(p)}
                          />
                        </td>
                        <td className="overflow-hidden px-3 py-1 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded(open ? null : key)
                            }
                            className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
                          >
                            {open ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-neutral-50 dark:bg-neutral-950/40">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="grid gap-3 text-xs sm:grid-cols-2">
                              <p>
                                <span className="opacity-50">Member: </span>
                                {p.name || "—"}
                              </p>
                              <p>
                                <span className="opacity-50">MRN: </span>
                                <span className="font-semibold tabular-nums">
                                  {p.mrn?.trim() || "—"}
                                </span>
                              </p>
                              <p>
                                <span className="opacity-50">{viaLabel(p)}: </span>
                                {via}
                              </p>
                              <p>
                                <span className="opacity-50">Registered: </span>
                                {p.registeredAt
                                  ? formatPracticeDateTime(p.registeredAt)
                                  : "—"}
                              </p>
                              <div className="sm:col-span-2">
                                <p className="opacity-50">Attachments</p>
                                <div className="mt-1">
                                  <AttachmentsIconButton
                                    attachments={patientAttachments(p)}
                                    patientName={p.name}
                                    onOpen={() => setDocsPatient(p)}
                                  />
                                </div>
                              </div>
                              {p.relationship?.trim() ? (
                                <p>
                                  <span className="opacity-50">Relation: </span>
                                  {p.relationship.trim()}
                                </p>
                              ) : null}
                              {p.address?.trim() ? (
                                <p>
                                  <span className="opacity-50">Address: </span>
                                  {p.address}
                                </p>
                              ) : null}
                              {p.providerNames?.length ? (
                                <p>
                                  <span className="opacity-50">Seen by: </span>
                                  {p.providerNames.join(", ")}
                                </p>
                              ) : null}
                              {p.dateOfBirth?.trim() ? (
                                <p>
                                  <span className="opacity-50">DOB: </span>
                                  {p.dateOfBirth}
                                </p>
                              ) : null}
                              {p.lastVisitAt ? (
                                <p>
                                  <span className="opacity-50">Last visit: </span>
                                  {formatPracticeDateTime(p.lastVisitAt)}
                                </p>
                              ) : null}
                            </div>
                            {p.patientId && (canArchive || canMerge) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {canArchive ? (
                                  <button
                                    type="button"
                                    disabled={permBusy === p.patientId}
                                    onClick={() =>
                                      void archivePatient(p.patientId!, p.name)
                                    }
                                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300"
                                  >
                                    Archive from clinic list
                                  </button>
                                ) : null}
                                {canMerge ? (
                                  mergeSurvivorId === p.patientId ? (
                                    <button
                                      type="button"
                                      onClick={() => setMergeSurvivorId(null)}
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                    >
                                      Survivor selected — pick a duplicate
                                    </button>
                                  ) : mergeSurvivorId ? (
                                    <button
                                      type="button"
                                      disabled={permBusy === p.patientId}
                                      onClick={() =>
                                        void mergeIntoSurvivor(p.patientId!)
                                      }
                                      className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200"
                                    >
                                      Merge into survivor
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMergeSurvivorId(p.patientId!)
                                      }
                                      className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200"
                                    >
                                      Mark as merge survivor
                                    </button>
                                  )
                                ) : null}
                              </div>
                            ) : null}
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
                                      {canViewHistory &&
                                      b.disease?.trim() &&
                                      !/^general\s+consultation$/i.test(
                                        b.disease,
                                      )
                                        ? b.disease
                                        : canViewHistory
                                          ? "No chief complaint"
                                          : "Visit"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusClass(b.status)}`}
                                    >
                                      {bookingStatusLabel(b.status)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 opacity-60">{visitWhen(b)}</p>
                                  {canViewHistory &&
                                  b.doctorRemarks?.trim() &&
                                  !/^Chief complaint:/i.test(b.doctorRemarks) &&
                                  !/AI brief for doctor:/i.test(
                                    b.doctorRemarks,
                                  ) ? (
                                    <p className="mt-1 whitespace-pre-wrap text-sm opacity-90">
                                      <span className="font-semibold">
                                        Doctor Notes:{" "}
                                      </span>
                                      {b.doctorRemarks}
                                    </p>
                                  ) : null}
                                  {canViewHistory ? (
                                    <VisitChartLines booking={b} />
                                  ) : (
                                    <p className="mt-1 text-xs text-neutral-500">
                                      Medical history hidden — needs View Patient Medical History.
                                    </p>
                                  )}
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
          <TablePagination
            pagination={listPagination}
            label="patients"
            className="shrink-0 border-t border-neutral-200 px-3 dark:border-neutral-700"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm font-medium text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
          {query
            ? "No patients match your search."
            : "No patients yet. Patients appear here after they register or book."}
        </div>
      )}

      <PatientDocumentsModal
        open={Boolean(docsPatient)}
        patientName={docsPatient?.name}
        documents={docsPatient ? patientAttachments(docsPatient) : []}
        onClose={() => setDocsPatient(null)}
      />
    </div>
  )
}
