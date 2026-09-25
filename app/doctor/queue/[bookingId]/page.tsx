"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Icon, ThinkingLoader } from "@/components"
import { firey } from "@/utils"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { getSessionUserId } from "@/lib/sessionUser"
import {
  BOOKING_DOCUMENT_ACCEPT,
  MAX_BOOKING_DOCUMENTS,
  uploadBookingDocument,
} from "@/lib/uploadBookingDocument"
import {
  bookingStatusClass,
  bookingStatusLabel,
} from "@/lib/bookingStatus"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { patchBookingFields } from "@/lib/liveBooking"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import PatientAvatar from "@/components/ui/procto/PatientAvatar"

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
  practice?: {
    id?: string
    name: string
    slug: string
    specialty?: string | null
  }
  location?: { name: string; address: string; city: string }
  provider?: { id: string; name: string | null; email?: string | null } | null
  patient?: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    gender: string | null
    address: string | null
    imgSrc?: string | null
    dateOfBirth: string | null
    age?: number | null
    contactNumber: string | null
  } | null
}

/** Auto-generated visit briefs — never load into the doctor's remarks box. */
function isAutoVisitBrief(text?: string | null): boolean {
  const t = text?.trim() || ""
  if (!t) return false
  return (
    /^Chief complaint:/i.test(t) ||
    /^Patient problem:/i.test(t) ||
    /^Patient's description:/i.test(t) ||
    /AI brief for doctor:/i.test(t)
  )
}

function doctorRemarksForEdit(text?: string | null): string {
  if (!text?.trim() || isAutoVisitBrief(text)) return ""
  return text.trim()
}

const TIMES = ["morning", "afternoon", "evening", "night"] as const

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—"
}

/** Optional patient fields: empty when we never collected the value. */
function blank(v: string | null | undefined) {
  return v?.trim() ? v.trim() : ""
}

function ageFromDob(dob?: string | null, age?: number | null): string {
  if (typeof age === "number" && age >= 0 && age <= 130) return String(age)
  if (!dob?.trim()) return ""
  const n = firey.calculateAge(dob)
  return n >= 0 && n <= 130 ? String(n) : ""
}

export default function VisitPage() {
  const params = useParams<{ bookingId: string }>()
  const router = useRouter()
  const bookingId = params.bookingId
  const {
    bookings: sharedBookings,
    ready,
    patchBooking: patchSharedBooking,
  } = usePracticeDashboard()

  const fromShared = useMemo(
    () =>
      sharedBookings.find((b) => b.id === bookingId) as VisitBooking | undefined,
    [sharedBookings, bookingId],
  )

  const [booking, setBooking] = useState<VisitBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [remarks, setRemarks] = useState("")
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [documents, setDocuments] = useState<VisitDoc[]>([])
  const [medName, setMedName] = useState("")
  const [medAmount, setMedAmount] = useState("1")
  const [medTimes, setMedTimes] = useState<string[]>(["morning"])

  const applyVisitData = useCallback((data: VisitBooking, opts?: { silent?: boolean }) => {
    setBooking(data)
    if (!opts?.silent) {
      setRemarks(doctorRemarksForEdit(data.doctorRemarks))
      setMedicines(Array.isArray(data.medicines) ? data.medicines : [])
      setDocuments(Array.isArray(data.documents) ? data.documents : [])
      setLoading(false)
    } else {
      if (Array.isArray(data.medicines)) setMedicines(data.medicines)
      if (Array.isArray(data.documents)) setDocuments(data.documents)
      if (data.doctorRemarks !== undefined) {
        setRemarks(doctorRemarksForEdit(data.doctorRemarks))
      }
    }
  }, [])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!bookingId) return null
    if (!opts?.silent) {
      setLoading(true)
      setError("")
    }
    const res = await proctoService.getBooking(bookingId)
    if (res.status !== "successful" || !res.data) {
      if (!opts?.silent) {
        setError(res.message || "Visit not found.")
        if (!fromShared) setLoading(false)
      }
      return null
    }
    const data = res.data as VisitBooking
    applyVisitData(data, opts)
    setDetailLoaded(true)
    return data
  }, [bookingId, fromShared, applyVisitData])

  useEffect(() => {
    if (fromShared) {
      setBooking((prev) =>
        prev
          ? patchBookingFields(prev, fromShared as Record<string, unknown>)
          : fromShared,
      )
      if (Array.isArray(fromShared.documents)) {
        setDocuments(fromShared.documents)
      }
      if (Array.isArray(fromShared.medicines)) {
        setMedicines(fromShared.medicines as Medicine[])
      }
      if (fromShared.doctorRemarks != null) {
        setRemarks(doctorRemarksForEdit(fromShared.doctorRemarks))
      }
      if (ready) setLoading(false)
    }
  }, [fromShared, ready])

  useEffect(() => {
    if (!bookingId) return
    if (fromShared && ready) {
      setLoading(false)
      if (!detailLoaded) void load({ silent: true })
      return
    }
    if (ready) void load()
  }, [bookingId, fromShared, ready, detailLoaded, load])

  useEffect(() => {
    if (!fromShared) return
    setBooking((prev) =>
      prev
        ? patchBookingFields(prev, fromShared as Record<string, unknown>)
        : prev,
    )
  }, [fromShared])

  function toggleTime(time: string) {
    setMedTimes((prev) =>
      prev.includes(time)
        ? prev.length > 1
          ? prev.filter((t) => t !== time)
          : prev
        : [...prev, time],
    )
  }

  async function persistVisit(
    nextMedicines: Medicine[],
    nextDocuments: VisitDoc[] = documents,
    opts?: { status?: string; successMessage?: string },
  ) {
    if (!bookingId || String(booking?.status || "").toUpperCase() === "COMPLETED")
      return false
    // Ensure WhatsApp / server documents are loaded before any save so we
    // never POST documents:[] and wipe patient attachments.
    let docsToSave = nextDocuments
    if (!detailLoaded || docsToSave.length === 0) {
      const fresh = await load({ silent: true })
      const serverDocs = Array.isArray(fresh?.documents) ? fresh!.documents! : []
      if (docsToSave.length === 0 && serverDocs.length > 0) {
        docsToSave = serverDocs
        setDocuments(serverDocs)
      }
    }
    setError("")
    const res = await proctoService.updateBookingVisit(bookingId, {
      doctorRemarks: remarks,
      medicines: nextMedicines,
      documents: docsToSave,
      ...(opts?.status ? { status: opts.status } : {}),
    })
    if (res.status !== "successful") {
      setError(res.message || "Could not save visit.")
      await load()
      return false
    }
    const saved = res.data as VisitBooking
    applyVisitData(saved, { silent: true })
    patchSharedBooking(bookingId, saved as Partial<ProctoBooking>)
    if (opts?.successMessage) setMessage(opts.successMessage)
    return true
  }

  async function addMedicine() {
    if (!medName.trim() || !bookingId) return
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") return
    const next = [
      ...medicines,
      {
        name: medName.trim(),
        amount: medAmount.trim() || "1",
        times: [...medTimes],
      },
    ]
    setMedicines(next)
    setMedName("")
    setMedAmount("1")
    setMedTimes(["morning"])
    setMessage("")
    await persistVisit(next, documents, { successMessage: "Medicine saved." })
  }

  async function removeMedicine(idx: number) {
    if (
      !bookingId ||
      String(booking?.status || "").toUpperCase() === "COMPLETED"
    )
      return
    const next = medicines.filter((_, i) => i !== idx)
    setMedicines(next)
    setMessage("")
    await persistVisit(next, documents, { successMessage: "Medicine removed." })
  }

  async function removeDocument(idx: number) {
    if (
      !bookingId ||
      String(booking?.status || "").toUpperCase() === "COMPLETED"
    )
      return
    const nextDocs = documents.filter((_, i) => i !== idx)
    setDocuments(nextDocs)
    setMessage("")
    await persistVisit(medicines, nextDocs, {
      successMessage: "Document removed.",
    })
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !bookingId) return
    if (documents.length >= MAX_BOOKING_DOCUMENTS) {
      setError(`At most ${MAX_BOOKING_DOCUMENTS} documents per visit.`)
      return
    }
    setUploading(true)
    setError("")
    setMessage("")
    try {
      const uploaded = await uploadBookingDocument(file)
      const nextDocs = [...documents, uploaded]
      setDocuments(nextDocs)
      const res = await proctoService.updateBookingVisit(bookingId, {
        doctorRemarks: remarks,
        medicines,
        documents: nextDocs,
      })
      if (res.status !== "successful") {
        setError(res.message || "Document uploaded but could not save to visit.")
        return
      }
      setBooking(res.data as VisitBooking)
      setMessage("Document saved.")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload document.",
      )
    } finally {
      setUploading(false)
    }
  }

  async function save(nextStatus?: string) {
    if (!bookingId) return
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") return
    setSaving(true)
    setError("")
    setMessage("")
    const res = await proctoService.updateBookingVisit(bookingId, {
      doctorRemarks: remarks,
      medicines,
      documents,
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    setSaving(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not save visit.")
      return
    }
    const saved = res.data as VisitBooking
    setBooking(saved)
    patchSharedBooking(bookingId, saved as Partial<ProctoBooking>)
    if (nextStatus === "COMPLETED") {
      setMessage("Visit completed.")
      router.push(practiceTabHref("patients"))
      return
    }
    setMessage("Visit saved.")
  }

  if (loading) {
    return (
      <div className="dashboard-page-wide py-10">
        <p className="text-sm opacity-70">Loading visit…</p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="dashboard-page-wide py-10">
        <p className="text-sm text-red-600">{error || "Visit not found."}</p>
        <Link href="/doctor/queue" className="mt-4 inline-block text-sm underline">
          ← Back to queue
        </Link>
      </div>
    )
  }

  const p = booking.patient
  const patientName = p?.name || booking.patientName || "Patient"
  const phone = formatPhoneDisplay(
    p?.contactNumber || p?.phone || booking.patientPhone,
  )
  const slotLabel =
    booking.tokenNumber != null
      ? `Token #${booking.tokenNumber}`
      : booking.slotStart
        ? new Date(booking.slotStart).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—"
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
  const isCompleted = String(booking.status || "").toUpperCase() === "COMPLETED"
  const selfId = getSessionUserId()
  const peerId = booking.patient?.id

  return (
    <div
      className={`dashboard-page-wide !mt-0 space-y-4 ${isCompleted ? "pb-8" : "pb-28"}`}
    >
      {/* Customer identity first — sticky at top of scroll */}
      <div className="sticky top-0 z-20 -mx-4 bg-[color-mix(in_srgb,var(--solune-canvas)_94%,transparent)] px-4 pb-1.5 pt-0 backdrop-blur-md xs:-mx-5 xs:px-5 md:-mx-6 md:px-6 dark:bg-[color-mix(in_srgb,#0f172a_94%,transparent)]">
        <section
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] dark:shadow-none"
          aria-label={`Patient ${patientName}`}
        >
          <div className="bg-[color-mix(in_srgb,var(--theme-primary)_12%,transparent)] px-3 py-2.5 sm:px-5 sm:py-3 dark:bg-[color-mix(in_srgb,var(--theme-primary)_18%,var(--solune-surface))]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <PatientAvatar
                  name={patientName}
                  imgSrc={p?.imgSrc}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-primary)] opacity-90 dark:opacity-100">
                    Appointment · {appointmentDate} · {slotLabel}
                  </p>
                  <h1 className="mt-0.5 break-words text-xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
                    {patientName}
                  </h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-neutral-700 dark:text-slate-300">
                    <span>{phone}</span>
                    <span className="opacity-40" aria-hidden>
                      ·
                    </span>
                    <span>
                      Age {ageFromDob(p?.dateOfBirth, p?.age)}
                      {dash(p?.gender) !== "—" ? ` · ${dash(p?.gender)}` : ""}
                    </span>
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusClass(booking.status)}`}
              >
                {bookingStatusLabel(booking.status)}
              </span>
            </div>
          </div>
        </section>

        {isCompleted ? (
          <p className="mt-2 text-sm text-green-700 dark:text-green-300">
            Visit completed. Details are under{" "}
            <Link href={practiceTabHref("patients")} className="underline">
              Patients
            </Link>
            .
          </p>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] dark:shadow-none">
        <dl className="grid gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3 sm:px-8">
          <Fact label="Date of birth" value={blank(p?.dateOfBirth)} />
          <Fact label="Age" value={ageFromDob(p?.dateOfBirth, p?.age)} />
          <Fact label="Gender" value={blank(p?.gender)} />
          <Fact label="Phone" value={phone} />
          <Fact label="Email" value={blank(p?.email)} />
          <Fact label="Address" value={blank(p?.address)} />
          <Fact label="Doctor" value={blank(booking.provider?.name)} />
          <Fact
            label="Location"
            value={
              booking.location
                ? [booking.location.name, booking.location.city]
                    .filter(Boolean)
                    .join(", ") || ""
                : ""
            }
          />
          <Fact
            label="Mode"
            value={booking.mode?.replace(/_/g, " ") || ""}
          />
          <Fact
            label="Channel"
            value={booking.channel?.replace(/_/g, " ") || ""}
          />
          {booking.tokenNumber != null ? (
            <Fact label="Token" value={`#${booking.tokenNumber}`} />
          ) : null}
        </dl>
      </section>

      {/* Remarks */}
      <section className="dashboard-panel !p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Remarks
        </h2>
        <p className="mt-1 text-xs opacity-60">
          Clinical remarks, advice, and follow-up for this visit.
        </p>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          readOnly={isCompleted}
          disabled={isCompleted}
          rows={5}
          placeholder="Clinical remarks, advice, follow-up…"
          className="mt-3 w-full resize-y rounded-xl border border-neutral-300 bg-transparent px-3 py-2.5 text-sm leading-relaxed disabled:opacity-80 dark:border-neutral-600"
        />
      </section>

      {/* Medicines + Documents — both always in view in the page scroll */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="dashboard-panel !p-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Medicines
          </h2>

          {!isCompleted ? (
            <div className="mt-3 space-y-2">
              <input
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void addMedicine()
                  }
                }}
                placeholder="Medicine name"
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
              />
              <div className="flex gap-2">
                <input
                  value={medAmount}
                  onChange={(e) => setMedAmount(e.target.value)}
                  placeholder="Dose"
                  className="w-24 rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
                />
                <button
                  type="button"
                  onClick={() => void addMedicine()}
                  className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTime(t)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${
                      medTimes.includes(t)
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                        : "border border-neutral-300 dark:border-neutral-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {medicines.length === 0 ? (
            <p className="mt-4 text-sm opacity-60">
              {isCompleted ? "No medicines recorded." : "None added yet."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {medicines.map((m, idx) => (
                <li
                  key={`${m.name}-${idx}`}
                  className="flex items-start justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs opacity-60">
                      {m.amount || "—"}
                      {m.times?.length ? ` · ${m.times.join(", ")}` : ""}
                    </p>
                  </div>
                  {!isCompleted ? (
                    <button
                      type="button"
                      onClick={() => void removeMedicine(idx)}
                      className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel !p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Documents
            </h2>
            <span className="text-xs opacity-50">
              {documents.length}/{MAX_BOOKING_DOCUMENTS}
            </span>
          </div>

          {!isCompleted ? (
            <label
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-6 text-center dark:border-blue-500/40 dark:bg-blue-950/20 ${
                uploading || documents.length >= MAX_BOOKING_DOCUMENTS
                  ? "pointer-events-none opacity-50"
                  : "hover:border-blue-500"
              }`}
            >
              <span className="text-sm font-semibold text-blue-700 dark:text-sky-300">
                {uploading
                  ? "Uploading…"
                  : documents.length >= MAX_BOOKING_DOCUMENTS
                    ? "Limit reached"
                    : "Upload image or PDF"}
              </span>
              <span className="text-xs opacity-70">JPG, PNG, WEBP, PDF · max 10 MB</span>
              <input
                type="file"
                className="hidden"
                accept={BOOKING_DOCUMENT_ACCEPT}
                disabled={
                  uploading || documents.length >= MAX_BOOKING_DOCUMENTS
                }
                onChange={(e) => void onUpload(e)}
              />
            </label>
          ) : null}

          {uploading ? (
            <div className="mt-3">
              <ThinkingLoader label="Uploading document" />
            </div>
          ) : null}

          {documents.length === 0 ? (
            <p className="mt-4 text-sm opacity-60">
              {isCompleted ? "No documents attached." : "No documents yet."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {documents.map((d, idx) => (
                <li
                  key={`${d.url}-${idx}`}
                  className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
                      <Icon name="written-page" className="size-4" />
                    </span>
                    <span className="truncate text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-sky-400">
                      {d.name || "View document"}
                    </span>
                  </a>
                  {!isCompleted ? (
                    <button
                      type="button"
                      onClick={() => void removeDocument(idx)}
                      className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Chat — single panel, no nested card / clipped height */}
      {selfId && peerId ? (
        <CareChatPanel
          className="min-h-[20rem]"
          selfUserId={selfId}
          peerUserId={peerId}
          peerName={patientName}
          subtitle="Patient WhatsApp replies also appear here."
        />
      ) : (
        <section className="dashboard-panel !p-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Chat
          </h2>
          <p className="mt-2 text-sm opacity-60">
            Chat is available when this visit is linked to a registered patient
            account.
          </p>
        </section>
      )}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
      ) : null}

      {/* Sticky actions — in page flow, not a portal that fights layouts */}
      {!isCompleted ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:left-[72px] xl:left-60 dark:border-[var(--solune-border-strong)] dark:bg-[color-mix(in_srgb,var(--solune-surface)_92%,transparent)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="hidden text-sm text-neutral-600 sm:block dark:text-slate-300">
              <span className="font-medium text-neutral-900 dark:text-white">
                {patientName}
              </span>
              {" · "}
              {slotLabel}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => router.push("/doctor/queue")}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-50 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-elevated)] dark:text-slate-100 dark:hover:bg-[var(--solune-surface-muted)]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-50 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-elevated)] dark:text-slate-100 dark:hover:bg-[var(--solune-surface-muted)]"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("COMPLETED")}
                className="rounded-xl border border-green-500/60 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 disabled:opacity-50 dark:border-green-400/30 dark:bg-[color-mix(in_srgb,theme(colors.green.500)_18%,var(--solune-surface))] dark:text-green-200"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-4">
                      <Icon
                        name="spinning-loader"
                        className="fill-green-800 dark:fill-green-200"
                      />
                    </span>
                    Saving…
                  </span>
                ) : (
                  "Finish appointment"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  const v = value?.trim()
  if (!v) return null
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-medium text-neutral-900 dark:text-slate-100">
        {v}
      </dd>
    </div>
  )
}
