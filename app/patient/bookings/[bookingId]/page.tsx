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
  IconPill,
  IconStethoscope,
  IconUser,
} from "@tabler/icons-react"
import { proctoService } from "@/lib/services/procto"
import PracticeReviewForm from "@/components/ui/procto/PracticeReviewForm"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { getSessionUserId } from "@/lib/sessionUser"
import { patchBookingFields } from "@/lib/liveBooking"
import { usePatientDashboard } from "@/contexts/PatientDashboardContext"

type Medicine = { name: string; amount?: string; times?: string[] }
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

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—"
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function statusTone(status: string) {
  switch ((status || "").toUpperCase()) {
    case "IN_PROGRESS":
      return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200"
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200"
    case "CANCELED":
    case "NO_SHOW":
      return "bg-neutral-500/10 text-neutral-600 ring-1 ring-neutral-400/30 dark:text-neutral-300"
    default:
      return "bg-blue-500/10 text-blue-800 ring-1 ring-blue-500/25 dark:text-sky-100"
  }
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
        <p className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-white">
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
  const doctor = booking.provider
  const contacts = Array.isArray(doctor?.contactNumbers)
    ? (doctor.contactNumbers as string[]).filter(Boolean)
    : []
  const canCancel =
    booking.status === "SCHEDULED" ||
    booking.status === "REQUESTED" ||
    booking.status === "ACCEPTED" ||
    booking.status === "CONFIRMED"

  const slot =
    booking.slotStart
      ? new Date(booking.slotStart).toLocaleString([], {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : booking.tokenNumber != null
        ? `Token #${booking.tokenNumber}`
        : "—"

  const bookedOn = booking.createdAt ?? booking.created_at
  const appointmentDate = booking.slotStart
    ? new Date(booking.slotStart).toLocaleDateString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : booking.sessionDate
      ? new Date(booking.sessionDate).toLocaleDateString([], {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—"

  const disease =
    dash(booking.disease) !== "—"
      ? dash(booking.disease)
      : dash(booking.consultationType)

  const isCompleted = booking.status === "COMPLETED"
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
                    <span>Dr. {doctor.name}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={`inline-flex h-8 items-center rounded-full px-3.5 text-xs font-bold uppercase ${statusTone(booking.status)}`}
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
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
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
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
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
            {bookedOn
              ? new Date(bookedOn).toLocaleString([], {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
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
              <DetailRow label="Your problem" value={disease} icon={IconNotes} />
            </div>
          </SectionCard>

          <SectionCard title="Doctor remarks" icon={IconNotes}>
            {booking.status === "COMPLETED" && booking.doctorRemarks?.trim() ? (
              <p className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {booking.doctorRemarks}
              </p>
            ) : booking.status === "COMPLETED" ? (
              <EmptyNote>No remarks from the doctor yet.</EmptyNote>
            ) : (
              <EmptyNote>
                The doctor will add remarks after your visit. Your problem was
                shared with them when you booked.
              </EmptyNote>
            )}
          </SectionCard>

          <SectionCard title="Medicines" icon={IconPill}>
            {medicines.length === 0 ? (
              <EmptyNote>No medicines prescribed for this visit.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {medicines.map((m, idx) => (
                  <li
                    key={`${m.name}-${idx}`}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-slate-800/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <IconPill className="size-4" stroke={1.75} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {m.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Dose: {m.amount || "—"}
                        {m.times?.length ? ` · ${m.times.join(", ")}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Documents" icon={IconFileText}>
            {documents.length === 0 ? (
              <EmptyNote>No documents attached to this visit.</EmptyNote>
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
              peerName={doctor?.name ? `Dr. ${doctor.name}` : "Doctor"}
              subtitle="Message your doctor about this visit. Clinic replies also go to WhatsApp. Do not share emergencies here — call the clinic."
            />
          </div>
        )
      })()}

      {isCompleted && practiceId ? (
        <section className="dashboard-panel mt-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              ★
            </span>
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
