"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  IconCalendar,
  IconDownload,
  IconFileText,
  IconNotes,
  IconPill,
  IconStethoscope,
} from "@tabler/icons-react"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import type { ProctoBooking } from "@/lib/services/procto"
import {
  formatBookingWhenDetailed,
  bookingWhenMs,
  isActiveBooking,
  sortBookingsByWhen,
} from "@/lib/bookingDisplay"
import { usePatientDashboard } from "@/contexts/PatientDashboardContext"
import { withDrTitle } from "@/lib/doctorName"
import { bookingStatusTone as statusTone } from "@/lib/bookingStatusTone"
import {
  buildPrescriptionPdf,
  prescriptionBlob,
  prescriptionFileName,
} from "@/lib/prescriptionPdf"
import {
  buildConsultationPdf,
  consultationFileName,
} from "@/lib/consultationPdf"

function formatWhen(booking: ProctoBooking) {
  return formatBookingWhenDetailed(booking)
}

function nextVisitLabel(booking: ProctoBooking | undefined) {
  if (!booking) return "No visit scheduled"
  const whenMs = bookingWhenMs(booking)
  if (!whenMs) return "Scheduled"
  const when = new Date(whenMs)
  const now = new Date()
  const diffDays = Math.ceil(
    (when.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  return `In ${diffDays} days`
}

export default function Dashboard() {
  const {
    bookings,
    loading,
    ready,
    liveConnected,
    error: loadError,
    refresh,
  } = usePatientDashboard()
  const showLoading = !ready && loading

  const [downloadingRxId, setDownloadingRxId] = useState<string | null>(null)
  const [downloadingConsultId, setDownloadingConsultId] = useState<string | null>(null)

  const upcoming = useMemo(
    () => sortBookingsByWhen(bookings.filter(isActiveBooking), "asc"),
    [bookings],
  )
  const completed = useMemo(
    () =>
      bookings.filter((b) => (b.status || "").toUpperCase() === "COMPLETED"),
    [bookings],
  )
  const clinics = useMemo(() => {
    const names = new Set(
      bookings
        .map((b) => b.practice?.name)
        .filter((n): n is string => Boolean(n)),
    )
    return names.size
  }, [bookings])

  const nextVisit = upcoming[0]

  /** Latest visit containing prescribed medicines */
  const latestPrescription = useMemo(() => {
    const withMeds = sortBookingsByWhen(
      bookings.filter(
        (b) =>
          Array.isArray(b.medicines) &&
          b.medicines.some((m) => Boolean(m?.name?.trim())),
      ),
      "desc",
    )
    const booking = withMeds[0]
    if (!booking) return null
    return {
      booking,
      medicines: (booking.medicines ?? []).filter((m) => Boolean(m?.name?.trim())),
    }
  }, [bookings])

  /** Latest visit with clinical findings, doctor notes, advice, vitals, or docs */
  const latestClinicalVisit = useMemo(() => {
    const sorted = sortBookingsByWhen(bookings, "desc")
    return (
      sorted.find((b) => {
        const hasMeds = Array.isArray(b.medicines) && b.medicines.length > 0
        const hasNotes = Boolean(
          b.doctorRemarks?.trim() ||
            (b as { doctor_remarks?: string | null }).doctor_remarks?.trim(),
        )
        const chart = b.clinicalAssessment as any
        const hasChart =
          chart &&
          (chart.diagnosis ||
            chart.advice ||
            chart.vitals?.values ||
            (Array.isArray(chart.allergies) && chart.allergies.length > 0))
        const hasDocs = Array.isArray(b.documents) && b.documents.length > 0
        return (
          hasMeds ||
          hasNotes ||
          hasChart ||
          hasDocs ||
          (b.status || "").toUpperCase() === "COMPLETED"
        )
      }) || null
    )
  }, [bookings])

  // Extract vitals and clinical fields from the latest consultation
  const clinicalChart = (latestClinicalVisit?.clinicalAssessment as any) ?? null
  const vitals = clinicalChart?.vitals?.values ?? null
  const bp =
    vitals?.bp_sys != null || vitals?.bp_dia != null
      ? `${vitals?.bp_sys ?? "—"}/${vitals?.bp_dia ?? "—"} mmHg`
      : null
  const pulse = vitals?.pr != null ? `${vitals.pr} bpm` : null
  const spo2 = vitals?.spo2 != null ? `${vitals.spo2}%` : null
  const rbs = vitals?.rbs != null ? `${vitals.rbs} mg/dL` : null
  const temp = vitals?.temp != null ? `${vitals.temp} °F` : null
  const weight = vitals?.wt != null ? `${vitals.wt} kg` : null
  const diagnosis = clinicalChart?.diagnosis || latestClinicalVisit?.disease || null
  const advice = clinicalChart?.advice || null
  const doctorNotes =
    latestClinicalVisit?.doctorRemarks ||
    (latestClinicalVisit as { doctor_remarks?: string | null })?.doctor_remarks ||
    null
  const clinicalDocs = Array.isArray(latestClinicalVisit?.documents)
    ? (latestClinicalVisit.documents as Array<{ name?: string; url: string }>)
    : []

  async function handleDownloadPrescription(b: ProctoBooking) {
    try {
      setDownloadingRxId(b.id)
      const bytes = await buildPrescriptionPdf(b as any)
      const blob = prescriptionBlob(bytes)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = prescriptionFileName(b as any)
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Prescription download error", err)
    } finally {
      setDownloadingRxId(null)
    }
  }

  async function handleDownloadConsultation(b: ProctoBooking) {
    try {
      setDownloadingConsultId(b.id)
      const bytes = await buildConsultationPdf(b as any)
      const blob = prescriptionBlob(bytes)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = consultationFileName(b as any)
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Consultation download error", err)
    } finally {
      setDownloadingConsultId(null)
    }
  }

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Patient portal"
        title={
          <>
            Your care,{" "}
            <span className="text-blue-600 dark:text-sky-400">at a glance</span>
          </>
        }
        subtitle="Book a clinic, track medications, view doctor notes, and open consultation details in real time."
        actionBelow
        action={
          <>
            <span
              className={`inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold ${
                liveConnected
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
              }`}
              title={
                liveConnected
                  ? "Live updates connected — changes in doctor/clinic queue reflect immediately"
                  : "Connecting live updates…"
              }
            >
              {liveConnected ? "Live Sync Active" : "Connecting…"}
            </span>
            <Link href="/practices" className="dashboard-btn-primary">
              Find a clinic
            </Link>
            <Link href="/patient/bookings" className="dashboard-btn-secondary">
              All bookings
            </Link>
          </>
        }
      />

      {showLoading && bookings.length === 0 ? (
        <div role="status" className="dashboard-grid-4 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-h-[9.5rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      ) : (
        <div className="dashboard-grid-4">
          <InsightStatCard
            title="Upcoming"
            value={upcoming.length}
            subtitle="Active bookings on your queue"
            href="/patient/bookings"
            icon="calendar"
            tone="blue"
          />
          <InsightStatCard
            title="Completed"
            value={completed.length}
            subtitle="Past visits on record"
            href="/patient/bookings"
            icon="heart-w-pulse"
            tone="green"
          />
          <InsightStatCard
            title="Prescriptions"
            value={latestPrescription?.medicines?.length ?? 0}
            subtitle={
              latestPrescription
                ? `${latestPrescription.medicines.length} medicines prescribed`
                : "No active prescription"
            }
            href={latestPrescription ? `/patient/bookings/${latestPrescription.booking.id}` : "/patient/bookings"}
            icon="monitoring"
            tone="rose"
          />
          <InsightStatCard
            title="Next visit"
            value={nextVisit ? nextVisitLabel(nextVisit) : "—"}
            subtitle={
              nextVisit
                ? `${nextVisit.practice?.name || "Clinic"} · ${formatWhen(nextVisit)}`
                : "Book a clinic to get started"
            }
            href={nextVisit ? `/patient/bookings/${nextVisit.id}` : "/practices"}
            icon="energy"
            tone="amber"
          />
        </div>
      )}

      {/* Next Up visit hero banner */}
      {!loading && !loadError && nextVisit ? (
        <Link
          href={`/patient/bookings/${nextVisit.id}`}
          className="dashboard-row relative border-sky-100 bg-white/90 dark:border-white/10 dark:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Next up
            </p>
            <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-white">
              {nextVisit.practice?.name || "Clinic"}
              {nextVisit.provider?.name
                ? ` · ${withDrTitle(nextVisit.provider.name)}`
                : ""}
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              {formatWhen(nextVisit)}
            </p>
            {Array.isArray(nextVisit.medicines) &&
            nextVisit.medicines.length > 0 ? (
              <p className="mt-1 truncate text-xs font-medium text-teal-700 dark:text-teal-300">
                Prescribed:{" "}
                {nextVisit.medicines
                  .map((m) => m.name)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ")}
                {nextVisit.medicines.length > 3
                  ? ` +${nextVisit.medicines.length - 3} more`
                  : ""}
              </p>
            ) : null}
          </div>
          <span
            className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-bold uppercase ${statusTone(nextVisit.status)}`}
          >
            {(nextVisit.status || "").replace(/_/g, " ")}
          </span>
        </Link>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 h-11 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Real-Time Clinical Data Reflection: Prescriptions & Doctor Findings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
        {/* Card 1: Prescribed Medicines (Rx) */}
        <section className="dashboard-panel p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300">
                  <IconPill className="size-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                    Prescriptions &amp; Medicines
                  </h2>
                  {latestPrescription ? (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Prescribed by {withDrTitle(latestPrescription.booking.provider?.name) || "Doctor"} · {latestPrescription.booking.practice?.name || "Clinic"}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Medications prescribed during consultations
                    </p>
                  )}
                </div>
              </div>
              {latestPrescription ? (
                <button
                  type="button"
                  disabled={downloadingRxId === latestPrescription.booking.id}
                  onClick={() => void handleDownloadPrescription(latestPrescription.booking)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 shadow-xs hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200 cursor-pointer disabled:opacity-50"
                  title="Download Official Prescription PDF"
                >
                  <IconDownload className="size-3.5" />
                  <span>{downloadingRxId === latestPrescription.booking.id ? "Downloading…" : "Prescription PDF"}</span>
                </button>
              ) : null}
            </div>

            {latestPrescription ? (
              <div className="mt-3 space-y-2.5 max-h-[320px] overflow-y-auto pr-1 custom-scroll">
                {latestPrescription.medicines.map((m: any, i: number) => (
                  <div
                    key={`${m.name}-${i}`}
                    className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-neutral-900 dark:text-white">
                            {m.name}
                          </span>
                          {m.strength ? (
                            <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                              {m.strength}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                          <span>
                            {m.dose ? `${m.dose} ${m.doseUnit || "tablet"}` : m.amount || "1 dose"} · {m.route || "Oral"}
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {m.frequency || (Array.isArray(m.times) ? m.times.join(", ") : "Once daily")}
                          </span>
                          {m.duration ? (
                            <>
                              <span>•</span>
                              <span>{m.duration} {m.durationUnit || "days"}</span>
                            </>
                          ) : null}
                        </div>
                        {m.instruction ? (
                          <div className="mt-1.5">
                            <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              📌 {m.instruction}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-neutral-400">
                <span className="text-3xl mb-1.5">💊</span>
                <p className="font-semibold text-neutral-700 dark:text-neutral-300 text-sm">
                  No active medicines prescribed yet
                </p>
                <p className="mt-0.5 max-w-xs text-neutral-400">
                  Prescriptions entered by your doctor or clinic during consultations will appear here with full dosage and timings.
                </p>
              </div>
            )}
          </div>

          {latestPrescription ? (
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                {latestPrescription.medicines.length} {latestPrescription.medicines.length === 1 ? "medicine" : "medicines"} prescribed
              </span>
              <Link
                href={`/patient/bookings/${latestPrescription.booking.id}`}
                className="font-semibold text-blue-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <span>View visit details</span>
                <span>→</span>
              </Link>
            </div>
          ) : null}
        </section>

        {/* Card 2: Latest Clinical Findings & Doctor Notes */}
        <section className="dashboard-panel p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-sky-300">
                  <IconStethoscope className="size-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                    Clinical Notes &amp; Vitals
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {latestClinicalVisit
                      ? `${latestClinicalVisit.practice?.name || "Clinic"} · ${formatWhen(latestClinicalVisit)}`
                      : "Doctor observations and vitals recorded"}
                  </p>
                </div>
              </div>
              {latestClinicalVisit ? (
                <button
                  type="button"
                  disabled={downloadingConsultId === latestClinicalVisit.id}
                  onClick={() => void handleDownloadConsultation(latestClinicalVisit)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 cursor-pointer disabled:opacity-50"
                  title="Download Consultation Summary PDF"
                >
                  <IconDownload className="size-3.5" />
                  <span>{downloadingConsultId === latestClinicalVisit.id ? "Downloading…" : "Summary PDF"}</span>
                </button>
              ) : null}
            </div>

            {latestClinicalVisit ? (
              <div className="mt-3 space-y-3">
                {/* Diagnosis */}
                {diagnosis ? (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                      Diagnosis
                    </span>
                    <p className="font-bold text-sm text-neutral-900 dark:text-white">
                      {diagnosis}
                    </p>
                  </div>
                ) : null}

                {/* Doctor Advice */}
                {advice ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Doctor Advice for Patient
                    </span>
                    <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                      {advice}
                    </p>
                  </div>
                ) : null}

                {/* Doctor Notes */}
                {doctorNotes ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      Doctor Notes
                    </span>
                    <p className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
                      {doctorNotes}
                    </p>
                  </div>
                ) : null}

                {/* Vitals Grid */}
                {bp || pulse || spo2 || rbs || temp || weight ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Recorded Vitals
                    </span>
                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {bp ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">Blood Pressure</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{bp}</p>
                        </div>
                      ) : null}
                      {pulse ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">Pulse</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{pulse}</p>
                        </div>
                      ) : null}
                      {spo2 ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">SpO2</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{spo2}</p>
                        </div>
                      ) : null}
                      {rbs ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">Blood Glucose</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{rbs}</p>
                        </div>
                      ) : null}
                      {temp ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">Temperature</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{temp}</p>
                        </div>
                      ) : null}
                      {weight ? (
                        <div className="rounded-lg bg-neutral-100/70 px-2.5 py-1.5 dark:bg-neutral-800">
                          <span className="text-[10px] text-neutral-400">Weight</span>
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">{weight}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Attached Documents */}
                {clinicalDocs.length > 0 ? (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Attached Reports &amp; Files ({clinicalDocs.length})
                    </span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {clinicalDocs.slice(0, 3).map((d, idx) => (
                        <a
                          key={idx}
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 hover:underline dark:border-neutral-700 dark:bg-neutral-800 dark:text-sky-400"
                        >
                          <IconFileText className="size-3.5" />
                          <span className="truncate max-w-[140px]">{d.name || "View report"}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-neutral-400">
                <span className="text-3xl mb-1.5">🩺</span>
                <p className="font-semibold text-neutral-700 dark:text-neutral-300 text-sm">
                  No clinical notes recorded yet
                </p>
                <p className="mt-0.5 max-w-xs text-neutral-400">
                  Diagnosis, doctor notes, advice, and vitals recorded during consultations will reflect here.
                </p>
              </div>
            )}
          </div>

          {latestClinicalVisit ? (
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end text-xs">
              <Link
                href={`/patient/bookings/${latestClinicalVisit.id}`}
                className="font-semibold text-blue-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Full visit history</span>
                <span>→</span>
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <div className="dashboard-grid-2 mt-6">
        <section>
          <div className="mb-4 flex h-12 flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="dashboard-section-title">Upcoming visits</h2>
              <p className="dashboard-section-sub">
                Active bookings on the clinic queue
              </p>
            </div>
            <Link href="/patient/bookings" className="dashboard-link">
              View history →
            </Link>
          </div>

          {showLoading ? (
            <p className="text-sm text-slate-500">Loading visits…</p>
          ) : loadError ? null : upcoming.length === 0 ? (
            <div className="dashboard-panel flex min-h-[12rem] flex-col items-center justify-center border-dashed text-center">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No upcoming visits
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Find a clinic and book a slot or token.
              </p>
              <Link href="/practices" className="dashboard-btn-primary mt-5">
                Browse clinics
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/patient/bookings/${b.id}`}
                    className="dashboard-row flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                        {b.practice?.name || "Clinic"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                        {withDrTitle(b.provider?.name) || "Doctor TBA"}{" "}
                        · {formatWhen(b)}
                      </p>

                      {/* Clinical reflection badges */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {Array.isArray(b.medicines) && b.medicines.length > 0 ? (
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                            💊 {b.medicines.length} {b.medicines.length === 1 ? "med" : "meds"}
                          </span>
                        ) : null}
                        {b.doctorRemarks || (b as any).doctor_remarks ? (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            📋 Doctor notes
                          </span>
                        ) : null}
                        {(b.clinicalAssessment as any)?.diagnosis || b.disease ? (
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            🩺 {(b.clinicalAssessment as any)?.diagnosis || b.disease}
                          </span>
                        ) : null}
                        {Array.isArray(b.documents) && b.documents.length > 0 ? (
                          <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            📄 {b.documents.length} docs
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex h-8 shrink-0 items-center gap-3">
                      <span
                        className={`inline-flex h-8 items-center rounded-full px-3 text-[11px] font-bold uppercase ${statusTone(b.status)}`}
                      >
                        {(b.status || "").replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-semibold text-blue-600 dark:text-sky-400">
                        Open →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="dashboard-section-title">Visit summary</h2>
              <p className="dashboard-section-sub">Your booking breakdown</p>
            </div>
          </div>
          <ul className="space-y-4">
            {[
              {
                label: "Upcoming",
                value: upcoming.length,
                pct: bookings.length
                  ? Math.round((upcoming.length / bookings.length) * 100)
                  : 0,
                color: "bg-blue-500",
              },
              {
                label: "Completed",
                value: completed.length,
                pct: bookings.length
                  ? Math.round((completed.length / bookings.length) * 100)
                  : 0,
                color: "bg-emerald-500",
              },
              {
                label: "Clinics visited",
                value: clinics,
                pct: clinics ? Math.min(clinics * 20, 100) : 0,
                color: "bg-rose-400",
              },
            ].map((row) => (
              <li key={row.label}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {row.label}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {row.value}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/practices"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-800 transition hover:border-blue-300 dark:border-white/15 dark:text-white"
          >
            Book another visit
          </Link>
        </section>
      </div>
    </div>
  )
}
