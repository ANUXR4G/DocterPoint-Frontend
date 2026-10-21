"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconDeviceDesktop,
  IconFileText,
  IconMail,
  IconMapPin,
  IconNotes,
  IconPhone,
  IconStethoscope,
  IconUser,
} from "@tabler/icons-react"
import { proctoService } from "@/lib/services/procto"
import PracticeReviewForm from "@/components/ui/procto/PracticeReviewForm"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { bookingStatusTone } from "@/lib/bookingStatusTone"
import { getSessionUserId } from "@/lib/sessionUser"
import { patchBookingFields } from "@/lib/liveBooking"
import { usePatientDashboard } from "@/contexts/PatientDashboardContext"
import {
  BOOKING_DOCUMENT_ACCEPT,
  uploadBookingDocument,
} from "@/lib/uploadBookingDocument"
import {
  chiefComplaintOf,
  formatBookingWhenDetailed,
} from "@/lib/bookingDisplay"
import {
  formatPracticeDate,
  formatPracticeDateTime,
} from "@/lib/practiceTime"
import { withDrTitle } from "@/lib/doctorName"
import {
  buildConsultationPdf,
  consultationFileName,
} from "@/lib/consultationPdf"
import {
  buildPrescriptionPdf,
  prescriptionBlob,
  prescriptionFileName,
} from "@/lib/prescriptionPdf"

type Medicine = {
  name: string
  strength?: string
  route?: string
  dose?: string
  doseUnit?: string
  frequency?: string
  duration?: string
  durationUnit?: string
  instruction?: string
  startDate?: string
  endDate?: string
  amount?: string
  times?: string[]
}
type VisitDoc = { name: string; url: string; uploadedAt?: string }

type VisitBooking = {
  id: string
  practiceId?: string
  status: string
  mode: string
  channel: string
  patientPhone?: string
  patientName?: string | null
  patientId?: string | null
  notes?: string | null
  consultationType?: string | null
  disease?: string | null
  doctorRemarks?: string | null
  clinicalAssessment?: unknown
  medicines?: Medicine[] | null
  documents?: VisitDoc[] | null
  slotStart?: string | null
  tokenNumber?: number | null
  sessionDate?: string | null
  createdAt?: string | null
  created_at?: string | null
  practice?: { id?: string; name: string; slug: string; specialty?: string | null }
  location?: { name: string; address: string; city: string }
  provider?: {
    id: string
    name: string | null
    email?: string | null
    phone?: string | null
    licenseNo?: string | null
    description?: string | null
    experience?: number | null
    contactNumbers?: unknown
  } | null
  reviewEligibility?: {
    canReview: boolean
    alreadyReviewed: boolean
    reason?: string
  } | null
}

function dash(v: string | number | null | undefined) {
  if (v == null) return "—"
  const text = String(v).trim()
  return text || "—"
}

type Chart = {
  savedAt?: string | null
  diagnosis?: string | null
  advice?: string | null
  noKnownAllergies?: boolean
  vitals?: {
    recordedAt?: string | null
    values?: Record<string, number | null>
  }
  allergies?: { name?: string; severity?: string; active?: string }[]
  pain?: { scale?: string; score?: string; location?: string; type?: string }[]
}

function chartOf(raw: unknown): Chart | null {
  if (!raw || typeof raw !== "object") return null
  return raw as Chart
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}


function LoadingSkeleton() {
  return (
    <div className="dashboard-page animate-pulse">
      <div className="dashboard-hero min-h-[10rem]" />
      <div className="dashboard-grid-4 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="min-h-[5.5rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
      <div className="dashboard-grid-2 mt-6">
        <div className="min-h-[16rem] rounded-[20px] bg-slate-100 dark:bg-slate-800" />
        <div className="min-h-[16rem] rounded-[20px] bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string; stroke?: number }>
  children: React.ReactNode
}) {
  return (
    <section className="dashboard-panel">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
          <Icon className="size-[18px]" stroke={1.75} />
        </span>
        <h2 className="dashboard-section-title">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string; stroke?: number }>
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 bg-sky-50/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
      {Icon ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-sky-400">
          <Icon className="size-4" stroke={1.75} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-slate-900 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      {children}
    </p>
  )
}

export default function PatientVisitPage() {
  const params = useParams<{ bookingId: string }>()
  const bookingId = params.bookingId
  const { bookings: sharedBookings, ready, refresh } = usePatientDashboard()

  const fromShared = useMemo(
    () => sharedBookings.find((b) => b.id === bookingId) as VisitBooking | undefined,
    [sharedBookings, bookingId],
  )

  const [booking, setBooking] = useState<VisitBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelBusy, setCancelBusy] = useState(false)
  const [flash, setFlash] = useState("")
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachError, setAttachError] = useState("")

  const loadDetail = useCallback(async (opts?: { silent?: boolean }) => {
    if (!bookingId) return
    if (!opts?.silent) {
      setLoading(true)
      setError("")
    }
    const res = await proctoService.getBooking(bookingId)
    if (res.status !== "successful" || !res.data) {
      if (!opts?.silent) {
        setError(res.message || "Visit not found.")
        if (!fromShared) setBooking(null)
        setLoading(false)
      }
      return
    }
    setBooking(res.data as VisitBooking)
    setDetailLoaded(true)
    if (!opts?.silent) setLoading(false)
  }, [bookingId, fromShared])

  useEffect(() => {
    if (fromShared) {
      setBooking((prev) =>
        prev ? patchBookingFields(prev, fromShared as Record<string, unknown>) : fromShared,
      )
      if (ready) setLoading(false)
    }
  }, [fromShared, ready])

  useEffect(() => {
    setDetailLoaded(false)
  }, [bookingId])

  useEffect(() => {
    if (!bookingId) return
    if (fromShared && ready) {
      setLoading(false)
      if (!detailLoaded) void loadDetail({ silent: true })
      return
    }
    if (ready) void loadDetail()
  }, [bookingId, fromShared, ready, detailLoaded, loadDetail])

  useEffect(() => {
    if (!fromShared) return
    setBooking((prev) =>
      prev
        ? patchBookingFields(prev, fromShared as Record<string, unknown>)
        : fromShared,
    )
  }, [fromShared])

  async function cancelVisit() {
    if (!booking) return
    if (
      !window.confirm(
        "Cancel this appointment? The clinic will be notified.",
      )
    ) {
      return
    }
    setCancelBusy(true)
    setFlash("")
    const res = await proctoService.cancelBooking(booking.id)
    setCancelBusy(false)
    if (res.status === "successful") {
      setFlash("Appointment canceled.")
      await refresh({ silent: true })
      await loadDetail({ silent: true })
    } else {
      setFlash(res.message || "Cancel failed.")
    }
  }

  async function onAttachDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !booking) return
    setAttachBusy(true)
    setAttachError("")
    try {
      const uploaded = await uploadBookingDocument(file)
      const res = await proctoService.attachPatientDocument(booking.id, {
        name: uploaded.name,
        url: uploaded.url,
      })
      if (res.status !== "successful") {
        setAttachError(res.message || "Could not attach document.")
        return
      }
      await refresh({ silent: true })
      await loadDetail({ silent: true })
      setFlash("Document attached for your doctor.")
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setAttachBusy(false)
    }
  }

  if (loading) return <LoadingSkeleton />

  if (!booking) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-panel text-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error || "Visit not found."}
          </p>
          <Link
            href="/patient/bookings"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline dark:text-sky-400"
          >
            <IconArrowLeft className="size-4" />
            Back to bookings
          </Link>
        </div>
      </div>
    )
  }

  const medicines = Array.isArray(booking.medicines) ? booking.medicines : []
  const documents = Array.isArray(booking.documents) ? booking.documents : []
  const doctorRemarks = (
    booking.doctorRemarks ||
    (booking as { doctor_remarks?: string | null }).doctor_remarks ||
    ""
  ).trim()
  const doctor = booking.provider
  const contacts = Array.isArray(doctor?.contactNumbers)
    ? (doctor.contactNumbers as string[]).filter(Boolean)
    : []
  const canCancel =
    booking.status === "SCHEDULED" ||
    booking.status === "REQUESTED" ||
    booking.status === "ACCEPTED" ||
    booking.status === "CONFIRMED"

  const slot = booking.slotStart
    ? formatBookingWhenDetailed(booking as any)
    : booking.tokenNumber != null
      ? `Token #${booking.tokenNumber}`
      : "—"

  const bookedOn = booking.createdAt ?? booking.created_at
  const appointmentDate = booking.slotStart
    ? formatPracticeDate(booking.slotStart)
    : booking.sessionDate
      ? formatPracticeDate(booking.sessionDate)
      : "—"

  const chart = chartOf(booking.clinicalAssessment)
  const vitalValues = chart?.vitals?.values ?? {}
  const bp =
    vitalValues.bp_sys != null || vitalValues.bp_dia != null
      ? `${vitalValues.bp_sys ?? "—"}/${vitalValues.bp_dia ?? "—"}`
      : ""
  const allergyText = chart?.noKnownAllergies
    ? "No known allergy"
    : (chart?.allergies ?? [])
        .filter((row) => row.name?.trim())
        .map((row) =>
          [row.name, row.severity, row.active === "Yes" ? "Active" : null]
            .filter(Boolean)
            .join(" — "),
        )
        .join("; ")
  const painText = (chart?.pain ?? [])
    .filter((row) => row.scale?.trim() || row.score?.trim() || row.location?.trim())
    .map((row) =>
      [row.scale, row.score, row.location, row.type].filter(Boolean).join(" · "),
    )
    .join("; ")
  const recordedAt = chart?.savedAt || chart?.vitals?.recordedAt || ""
  const recorded = recordedAt ? formatPracticeDateTime(recordedAt) : ""
  function formatMedicineLine(m: Medicine): string {
    const parts: string[] = []
    if (m.strength) parts.push(m.strength)
    const dose = m.dose ? `${m.dose}${m.doseUnit ? ` ${m.doseUnit}` : ""}` : m.amount
    if (dose) parts.push(dose)
    if (m.route && m.route !== "Oral") parts.push(`via ${m.route}`)
    const freq = m.frequency || (Array.isArray(m.times) ? m.times.join(", ") : "")
    if (freq) parts.push(freq)
    if (m.duration) parts.push(`for ${m.duration} ${m.durationUnit || "days"}`)
    if (m.instruction) parts.push(`[${m.instruction}]`)
    return parts.length ? `${m.name} — ${parts.join(" · ")}` : m.name
  }

  const recordRows: Array<[string, string]> = [
    ["Chief complaint", dash(chiefComplaintOf(booking))],
    ["Diagnosis", dash(chart?.diagnosis || booking.disease)],
    ["Doctor Advice", dash(chart?.advice)],
    ["Doctor Notes", dash(doctorRemarks)],
    ["Mode", dash(formatLabel(booking.mode || ""))],
    ["Channel", dash(formatLabel(booking.channel || ""))],
    ["Token", booking.tokenNumber != null ? `#${booking.tokenNumber}` : "—"],
    ["Recorded", dash(recorded)],
    ["Height", dash(vitalValues.ht)],
    ["Weight", dash(vitalValues.wt)],
    ["BMI", dash(vitalValues.bmi)],
    ["Temperature", dash(vitalValues.temp)],
    ["Blood pressure", dash(bp)],
    ["Pulse", dash(vitalValues.pr)],
    ["Respiration", dash(vitalValues.rr)],
    ["SpO2", dash(vitalValues.spo2)],
    ["RBS", dash(vitalValues.rbs)],
    ["Allergies", dash(allergyText)],
    ["Pain", dash(painText)],
    [
      "Medicines",
      medicines.length
        ? medicines
            .map((m, i) => `${i + 1}. ${formatMedicineLine(m)}`)
            .join("\n")
        : "—",
    ],
  ]

  async function downloadPrint(kind: "consultation" | "prescription") {
    if (!booking) return
    const bytes =
      kind === "consultation"
        ? await buildConsultationPdf(booking)
        : await buildPrescriptionPdf(booking)
    const blob = prescriptionBlob(bytes)
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download =
      kind === "consultation"
        ? consultationFileName(booking)
        : prescriptionFileName(booking)
    link.click()
    URL.revokeObjectURL(url)
  }

  const isCompleted = (booking.status || "").toUpperCase() === "COMPLETED"
  const practiceId =
    booking.practiceId ?? booking.practice?.id ?? null
  const canReview =
    isCompleted && booking.reviewEligibility?.canReview === true
  const alreadyReviewed =
    isCompleted && booking.reviewEligibility?.alreadyReviewed === true

  return (
    <div className="dashboard-page">
      {/* Hero header */}
      <header className="dashboard-hero">
        <div aria-hidden className="dashboard-hero-glow" />
        <div className="relative">
          <Link
            href="/patient/bookings"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700 dark:text-sky-400"
          >
            <IconArrowLeft className="size-4" />
            Back to bookings
          </Link>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Visit details
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {booking.practice?.name || "Clinic visit"}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <IconCalendar className="size-4 shrink-0 text-blue-500" />
                <span>{slot}</span>
                {doctor?.name ? (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <IconStethoscope className="size-4 shrink-0 text-blue-500" />
                    <span>{withDrTitle(doctor.name)}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={`inline-flex h-8 items-center rounded-full px-3.5 text-xs font-bold uppercase ${bookingStatusTone(booking.status)}`}
              >
                {formatLabel(booking.status)}
              </span>
              {canCancel ? (
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => void cancelVisit()}
                  className="inline-flex h-9 items-center rounded-full border border-red-200 bg-white px-4 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  {cancelBusy ? "Canceling…" : "Cancel appointment"}
                </button>
              ) : isCompleted ? (
                <p className="max-w-[14rem] text-right text-xs text-slate-500 dark:text-slate-400">
                  Finished — cannot cancel or reschedule
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {flash ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            flash.includes("canceled")
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {flash}
        </div>
      ) : null}

      {/* Quick summary */}
      <div className="dashboard-grid-4">
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
            <IconCalendar className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Appointment
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {appointmentDate}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <IconClock className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Mode
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
            {formatLabel(booking.mode)}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <IconDeviceDesktop className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Channel
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
            {formatLabel(booking.channel)}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <IconNotes className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Booked on
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-slate-900 dark:text-white">
            {bookedOn ? formatPracticeDateTime(bookedOn) : "—"}
          </p>
        </div>
      </div>

      <div className="dashboard-grid-2 items-start">
        {/* Left column — visit info */}
        <div className="space-y-5">
          <SectionCard title="Appointment" icon={IconMapPin}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Clinic"
                value={dash(booking.practice?.name)}
                icon={IconStethoscope}
              />
              <DetailRow
                label="Location"
                value={
                  booking.location
                    ? `${booking.location.address}, ${booking.location.city}`
                    : "—"
                }
                icon={IconMapPin}
              />
              <DetailRow
                label="Chief complaint"
                value={dash(chiefComplaintOf(booking))}
                icon={IconNotes}
              />
            </div>
          </SectionCard>

          {/* Prescribed Medicines (Rx) */}
          {medicines.length > 0 ? (
            <SectionCard title="Prescribed Medicines (Rx)" icon={IconNotes}>
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <table className="w-full min-w-[500px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60 font-semibold text-neutral-700 dark:text-neutral-300">
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Medicine</th>
                        <th className="p-2.5">Dosage &amp; Route</th>
                        <th className="p-2.5">Frequency</th>
                        <th className="p-2.5">Duration</th>
                        <th className="p-2.5">Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {medicines.map((m, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                          <td className="p-2.5 text-neutral-400 font-medium">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-neutral-900 dark:text-white">
                            {m.name}
                            {m.strength ? (
                              <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                {m.strength}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2.5 text-neutral-600 dark:text-neutral-300">
                            {m.dose ? `${m.dose} ${m.doseUnit || "tablet"}` : m.amount || "1"} · {m.route || "Oral"}
                          </td>
                          <td className="p-2.5 font-medium text-neutral-700 dark:text-neutral-300">
                            {m.frequency || (Array.isArray(m.times) ? m.times.join(", ") : "Once daily")}
                          </td>
                          <td className="p-2.5 text-neutral-600 dark:text-neutral-400">
                            {m.duration ? `${m.duration} ${m.durationUnit || "days"}` : "5 days"}
                          </td>
                          <td className="p-2.5">
                            {m.instruction ? (
                              <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                {m.instruction}
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => void downloadPrint("prescription")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3.5 text-xs font-semibold text-sky-900 shadow-xs hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200 cursor-pointer"
                  >
                    <span>📄</span>
                    <span>Download Prescription (PDF)</span>
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* Doctor Advice & Clinical Notes */}
          {chart?.advice || doctorRemarks || chart?.diagnosis ? (
            <SectionCard title="Doctor Advice &amp; Clinical Notes" icon={IconStethoscope}>
              <div className="space-y-3">
                {chart?.diagnosis ? (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                      Diagnosis
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-neutral-900 dark:text-white">
                      {chart.diagnosis}
                    </p>
                  </div>
                ) : null}

                {chart?.advice ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Doctor Advice for Patient
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                      {chart.advice}
                    </p>
                  </div>
                ) : null}

                {doctorRemarks ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Doctor Notes
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                      {doctorRemarks}
                    </p>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Visit record" icon={IconNotes}>
            <div className="grid gap-3 sm:grid-cols-2">
              {recordRows.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadPrint("consultation")}
                className="inline-flex h-11 items-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Download consultation
              </button>
              <button
                type="button"
                onClick={() => void downloadPrint("prescription")}
                className="inline-flex h-11 items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800"
              >
                Download prescription
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Documents" icon={IconFileText}>
            {documents.length === 0 ? (
              <EmptyNote>
                No documents yet. Attach a lab report or photo for your doctor.
              </EmptyNote>
            ) : (
              <ul className="space-y-2">
                {documents.map((d, idx) => (
                  <li key={`${d.url}-${idx}`}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="dashboard-row flex !min-h-0 flex-row items-center !justify-start gap-3 !py-3 transition hover:border-blue-200 dark:hover:border-blue-500/30"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
                        <IconFileText className="size-4" stroke={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-blue-600 dark:text-sky-400">
                        {d.name || "View document"}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {booking.status !== "CANCELED" && booking.status !== "NO_SHOW" ? (
              <div className="mt-3">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700">
                  <input
                    type="file"
                    accept={BOOKING_DOCUMENT_ACCEPT}
                    className="hidden"
                    disabled={attachBusy}
                    onChange={(e) => void onAttachDocument(e)}
                  />
                  {attachBusy ? "Uploading…" : "Attach document"}
                </label>
                {attachError ? (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    {attachError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </SectionCard>
        </div>

        {/* Right column — doctor card */}
        <aside className="lg:sticky lg:top-6">
          <SectionCard title="Your doctor" icon={IconUser}>
            <div className="mb-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50/80 p-4 dark:border-blue-500/20 dark:from-slate-800 dark:to-slate-900">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {dash(doctor?.name)}
              </p>
              <p className="mt-1 text-sm text-blue-600 dark:text-sky-400">
                {dash(booking.practice?.specialty)}
              </p>
              {doctor?.experience != null ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {doctor.experience} years experience
                </p>
              ) : null}
              {doctor?.description?.trim() ? (
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {doctor.description}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <DetailRow
                label="License"
                value={dash(doctor?.licenseNo)}
                icon={IconFileText}
              />
              <DetailRow
                label="Email"
                value={dash(doctor?.email)}
                icon={IconMail}
              />
              <DetailRow
                label="Phone"
                value={dash(doctor?.phone || contacts[0])}
                icon={IconPhone}
              />
            </div>

            {booking.practice?.slug ? (
              <Link
                href={`/practices/${booking.practice.slug}`}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                View clinic profile
              </Link>
            ) : null}
          </SectionCard>
        </aside>
      </div>

      {(() => {
        const selfId = getSessionUserId()
        const peerId = doctor?.id
        if (!selfId || !peerId) return null
        return (
          <div className="mt-6">
            <CareChatPanel
              selfUserId={selfId}
              peerUserId={peerId}
              peerName={withDrTitle(doctor?.name) || "Doctor"}
              subtitle="Message your doctor about this visit. Attach reports here too. Clinic replies also go to WhatsApp. Do not share emergencies here — call the clinic."
              bookingId={booking.id}
              threadSince={booking.createdAt ?? booking.created_at ?? null}
              attachAs="patient"
              onDocumentShared={() => void refresh()}
            />
          </div>
        )
      })()}

      {isCompleted && practiceId ? (
        <section className="dashboard-panel mt-6">
          <div className="mb-4">
            <h2 className="dashboard-section-title">Your review</h2>
          </div>
          {alreadyReviewed ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
              Thank you — your review has been submitted and appears on the
              clinic&apos;s Find Care profile.
            </p>
          ) : canReview ? (
            <PracticeReviewForm
              practiceId={practiceId}
              bookingId={booking.id}
              defaultAuthorName={booking.patientName ?? ""}
              providerName={booking.provider?.name}
              onSubmitted={() => void loadDetail({ silent: true })}
            />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Reviews are not available for this visit.
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
