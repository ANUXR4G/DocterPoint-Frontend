"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  getPracticeProvider,
  getPracticeProviders,
  proctoService,
} from "@/lib/services/procto"
import { useProfile } from "@/hooks/useProfile"
import { useToken } from "@/hooks/useToken"
import { cookies } from "@/utils/cookies"
import { FlipEfButton } from "@/components"
import VoiceTextInput, {
  type VoiceTextInputHandle,
} from "@/components/inputs/VoiceTextInput"
import {
  buildBookingReviewSnapshot,
  type BookingReviewSnapshot,
} from "@/lib/bookingReview"
import { practiceTodayIso, formatPracticeTime } from "@/lib/practiceTime"
import {
  BOOKING_DOCUMENT_ACCEPT,
  MAX_BOOKING_DOCUMENTS,
  uploadBookingDocument,
  type BookingDocument,
} from "@/lib/uploadBookingDocument"

type Practice = {
  id: string
  name: string
  slug: string
  specialty: string | null
  consultationFee: number | null
  locations: { id: string; name: string; city: string; address: string }[]
  members: {
    role: string
    user: {
      id: string
      name: string | null
      doctor?: { appointmentValidityDays?: number } | null
    }
  }[]
  schedules?: { mode: string; dayOfWeek: number; providerId: string }[]
}

type Availability = {
  timeSlots: {
    start: string
    end: string
    available: boolean
    booked: number
    capacity: number
  }[]
  tokenSessions: {
    sessionStart: string
    sessionEnd: string
    nextToken: number
    available: boolean
    issued: number
    capacity: number
  }[]
  appointmentValidityDays?: number
  bookableFrom?: string
  bookableUntil?: string
  configuredMode?: "TIME_BASED" | "TOKEN_BASED" | null
  configuredModes?: string[]
  outsideValidity?: boolean
}

const STEPS = ["Book", "Confirm"]

function toDateInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isFutureSlotStart(start: string): boolean {
  const t = new Date(start).getTime()
  return Number.isFinite(t) && t > Date.now()
}

function addDays(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Prefer next weekday when today is Sunday (common Mon–Sat clinics). */
function defaultBookableDate(maxDate?: string) {
  const d = new Date()
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  const value = toDateInputValue(d)
  if (maxDate && value > maxDate) return maxDate
  return value
}

function resolveProviderBookingMode(
  modes: string[],
): "TIME_BASED" | "TOKEN_BASED" | null {
  const unique = Array.from(new Set(modes))
  if (!unique.length) return null
  if (unique.length === 1) return unique[0] as "TIME_BASED" | "TOKEN_BASED"
  return "TIME_BASED"
}

export default function BookingFlow({ practice }: { practice: Practice }) {
  const router = useRouter()
  const token = useToken()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const isLoggedIn = Boolean(
    token ||
      cookies.getCookie("refresh_token") ||
      cookies.getCookie("access_token"),
  )

  const location = practice.locations[0]
  const clinicDoctors = useMemo(
    () => getPracticeProviders(practice.members),
    [practice.members],
  )
  const [providerId, setProviderId] = useState(
    () => getPracticeProvider(practice.members)?.id ?? "",
  )
  const provider = clinicDoctors.find((d) => d.id === providerId) ?? clinicDoctors[0]
  const validityFromProfile =
    provider &&
    practice.members.find((m) => m.user.id === provider.id)?.user.doctor
      ?.appointmentValidityDays

  const scheduleModes = useMemo(() => {
    const fromSchedules = (practice.schedules ?? [])
      .filter((s) => !provider || s.providerId === provider.id)
      .map((s) => s.mode)
    return Array.from(new Set(fromSchedules))
  }, [practice.schedules, provider])

  const providerModeFromProfile = resolveProviderBookingMode(scheduleModes)

  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<"TIME_BASED" | "TOKEN_BASED">(
    providerModeFromProfile ?? "TIME_BASED",
  )
  const [validityDays, setValidityDays] = useState(
    () => Math.max(1, validityFromProfile ?? 7),
  )
  const [bookableUntil, setBookableUntil] = useState(() =>
    toDateInputValue(addDays(new Date(), Math.max(1, validityFromProfile ?? 7) - 1)),
  )
  const [date, setDate] = useState(() => defaultBookableDate(bookableUntil))
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [disease, setDisease] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  /** Frozen summary when entering Confirm — preserves slot across step navigation. */
  const [review, setReview] = useState<BookingReviewSnapshot | null>(null)
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [documents, setDocuments] = useState<BookingDocument[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const diseaseVoiceRef = useRef<VoiceTextInputHandle>(null)

  function goToConfirm() {
    if (!location || !provider) return
    if (!privacyConsent) {
      setMessage(
        "Please consent to storing your name and phone for this booking.",
      )
      return
    }
    if (mode === "TIME_BASED" && !selectedSlot) {
      setMessage("Select a time slot.")
      return
    }
    if (mode === "TOKEN_BASED" && !tokenSession?.available) {
      setMessage("No token session available for this date.")
      return
    }

    const snapshot = buildBookingReviewSnapshot({
      mode,
      dateIso: date,
      selectedSlot,
      tokenNext: tokenSession?.nextToken,
      tokenSessionStart: tokenSession?.sessionStart,
      tokenSessionEnd: tokenSession?.sessionEnd,
      clinicName: practice.name,
      providerName: provider.name ?? "Doctor",
      locationName: location.name,
      locationCity: location.city,
      locationAddress: location.address,
      consultationFee: practice.consultationFee,
    })
    if (!snapshot) {
      setMessage("Select a time slot before continuing.")
      return
    }
    setReview(snapshot)
    setMessage("")
    setStep(1)
  }

  useEffect(() => {
    if (!profile || prefilled) return
    if (profile.name) setName(profile.name)
    if (profile.contactNumber) setPhone(String(profile.contactNumber))
    if (profile.email) setEmail(String(profile.email))
    setPrefilled(true)
  }, [profile, prefilled])

  useEffect(() => {
    if (!location || !provider) return
    setSelectedSlot(null)
    setReview(null)
    proctoService
      .getAvailability({
        practiceId: practice.id,
        providerId: provider.id,
        locationId: location.id,
        date,
      })
      .then((res) => {
        if (res.status === "successful") {
          const data = res.data as Availability
          setAvailability(data)
          if (data.appointmentValidityDays) {
            setValidityDays(data.appointmentValidityDays)
          }
          if (data.bookableUntil) {
            setBookableUntil(data.bookableUntil)
            if (date > data.bookableUntil) {
              setDate(data.bookableUntil)
            }
          }
          if (data.configuredMode) {
            setMode(data.configuredMode)
          } else if (data.configuredModes?.length === 1) {
            setMode(data.configuredModes[0] as "TIME_BASED" | "TOKEN_BASED")
          }
        } else {
          setAvailability({ timeSlots: [], tokenSessions: [] })
        }
      })
  }, [practice.id, location, provider, date])

  useEffect(() => {
    if (providerModeFromProfile) setMode(providerModeFromProfile)
  }, [providerModeFromProfile, providerId])

  const tokenSession = availability?.tokenSessions?.[0]
  const availableSlots = useMemo(
    () =>
      availability?.timeSlots?.filter(
        (s) => s.available && isFutureSlotStart(s.start),
      ) ?? [],
    [availability],
  )

  const activeMode =
    availability?.configuredMode ??
    (availability?.configuredModes?.length === 1
      ? (availability.configuredModes[0] as "TIME_BASED" | "TOKEN_BASED")
      : null) ??
    providerModeFromProfile ??
    mode

  const closedToday =
    availability !== null &&
    !availability.outsideValidity &&
    availableSlots.length === 0 &&
    !tokenSession?.available

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (documents.length >= MAX_BOOKING_DOCUMENTS) {
      setMessage(`You can attach up to ${MAX_BOOKING_DOCUMENTS} files.`)
      return
    }

    setUploadingDoc(true)
    setMessage("")
    try {
      const doc = await uploadBookingDocument(file)
      setDocuments((prev) => [...prev, doc])
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      )
    } finally {
      setUploadingDoc(false)
    }
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index))
  }

  async function confirmBooking() {
    if (!location || !provider) return
    diseaseVoiceRef.current?.stopVoice()
    if (!privacyConsent) {
      setMessage(
        "Please consent to storing your name and phone for this booking.",
      )
      return
    }
    if (!phone.trim() && !isLoggedIn) {
      setMessage("Enter your mobile number to continue.")
      return
    }
    if (isLoggedIn && !phone.trim()) {
      setMessage("Add a contact number on your profile before booking.")
      return
    }
    if (!disease.trim()) {
      setMessage("Please describe the problem / reason for your visit.")
      return
    }
    if (mode === "TIME_BASED" && !selectedSlot) {
      setMessage("Select a time slot.")
      return
    }
    if (
      mode === "TIME_BASED" &&
      selectedSlot &&
      !isFutureSlotStart(selectedSlot)
    ) {
      setMessage("That time has already passed. Pick a later slot.")
      setSelectedSlot(null)
      return
    }

    setSubmitting(true)
    setMessage("")

    const body: Record<string, unknown> = {
      practiceId: practice.id,
      locationId: location.id,
      providerId: provider.id,
      mode,
      channel: "PATIENT_APP",
      disease: disease.trim(),
    }
    if (phone.trim()) body.patientPhone = phone.trim()
    if (name.trim()) body.patientName = name.trim()
    if (mode === "TIME_BASED" && selectedSlot) body.slotStart = selectedSlot
    if (mode === "TOKEN_BASED") body.sessionDate = date
    if (documents.length) body.documents = documents

    const res = await proctoService.createBooking(body)
    setSubmitting(false)

    if (res.status === "successful" && res.data?.id) {
      router.push(`/bookings/confirmation?id=${res.data.id}`)
      return
    }
    setMessage(res.message ?? "Booking failed. Try another slot.")
  }

  if (!location || !provider) {
    return (
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        This practice is not fully configured for online booking yet.
      </p>
    )
  }

  const minDate = practiceTodayIso()
  const maxDate = bookableUntil

  return (
    <div className="dashboard-panel p-5 sm:p-6">
      <div className="mb-6 flex gap-2" role="list" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            role="listitem"
            aria-current={i === step ? "step" : undefined}
            className={`flex-1 rounded-lg py-2.5 text-center text-sm font-semibold ${
              i === step
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Book a visit at {practice.name}.
          </p>
          {clinicDoctors.length > 1 ? (
            <div className="space-y-2">
              <p className="text-slate-900 dark:text-white font-semibold text-sm font-semibold">Doctor</p>
              <div className="flex flex-col gap-2">
                {clinicDoctors.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setProviderId(d.id)
                      setSelectedSlot(null)
                      setAvailability(null)
                      setReview(null)
                    }}
                    className={`min-h-12 rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                      provider?.id === d.id
                        ? "border-[#0099ff] bg-[#0099ff]/10 text-neutral-900 dark:text-white"
                        : "border-neutral-300 text-neutral-800 dark:border-white/20 dark:text-neutral-200"
                    }`}
                  >
                    Dr. {d.name ?? "Provider"}
                  </button>
                ))}
              </div>
            </div>
          ) : provider ? (
            <p className="text-slate-900 dark:text-white font-semibold text-sm font-semibold">
              Dr. {provider.name ?? "Provider"}
            </p>
          ) : null}

          {activeMode === "TIME_BASED" ? (
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Booking type: Time slots
            </p>
          ) : activeMode === "TOKEN_BASED" ? (
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Booking type: Token queue
            </p>
          ) : null}

          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Date
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                setSelectedSlot(null)
              }}
              className="form-input mt-1 min-h-12 w-full rounded-lg px-3 py-3 text-base"
            />
          </label>

          {availability?.outsideValidity && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              This date is outside the doctor&apos;s {validityDays}-day booking
              window. Pick a date on or before {maxDate}.
            </p>
          )}

          {closedToday && (
            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:bg-white/5 dark:text-neutral-300">
              No open slots on this day. Try another working day.
            </p>
          )}

          {activeMode === "TIME_BASED" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
              {availableSlots.map((s) => {
                const label = formatPracticeTime(s.start)
                const remaining = Math.max(0, s.capacity - s.booked)
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => setSelectedSlot(s.start)}
                    className={`inline-flex min-h-12 items-center justify-between gap-2 rounded-lg px-3 py-3 text-sm font-semibold tabular-nums ${
                      selectedSlot === s.start
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                        : "border border-neutral-300 text-neutral-800 dark:border-white/20 dark:text-neutral-200"
                    }`}
                    title={`${remaining} of ${s.capacity} left`}
                  >
                    <span>{label}</span>
                    {s.capacity > 1 ? (
                      <span className="text-xs font-medium opacity-80">
                        {remaining}/{s.capacity}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          {activeMode === "TOKEN_BASED" && tokenSession && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Next token{" "}
              <strong className="text-slate-900 dark:text-white font-semibold">#{tokenSession.nextToken}</strong> ·{" "}
              {tokenSession.sessionStart}–{tokenSession.sessionEnd} (
              {tokenSession.issued}/{tokenSession.capacity})
            </p>
          )}

          <label className="flex items-start gap-3 text-sm text-neutral-800 dark:text-neutral-200">
            <input
              type="checkbox"
              checked={privacyConsent}
              onChange={(e) => setPrivacyConsent(e.target.checked)}
              className="mt-0.5 size-5 shrink-0"
              required
            />
            <span>
              I consent to GlucoGuide storing my name and phone for this booking
              (see{" "}
              <Link href="/privacy" className="text-blue-600 hover:text-blue-700 dark:text-sky-400 font-semibold" target="_blank">
                Privacy
              </Link>
              ).
            </span>
          </label>

          {message && step === 0 && (
            <p className="text-sm text-red-700 dark:text-red-400" role="alert">
              {message}
            </p>
          )}

          <FlipEfButton
            onClick={goToConfirm}
            disabled={
              !privacyConsent ||
              (mode === "TIME_BASED"
                ? !selectedSlot
                : !tokenSession?.available)
            }
            className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 h-12 w-full !py-3 disabled:opacity-40"
          >
            Review booking
          </FlipEfButton>
        </div>
      )}

      {step === 1 && review && (
        <div className="space-y-4">
          <div
            className="rounded-xl border-2 border-[#0099ff] bg-white px-4 py-4 dark:bg-[#0f0f0f]"
            data-testid="booking-review-summary"
            role="region"
            aria-label="Appointment summary"
          >
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0099ff]">
              Review before you confirm
            </p>

            <div className="mt-3 rounded-lg bg-[#0099ff]/10 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Appointment date
              </p>
              <p
                className="mt-0.5 text-xl font-bold tracking-tight text-neutral-900 dark:text-white"
                data-testid="booking-review-date"
              >
                {review.dateLabel}
              </p>
              {review.timeLabel ? (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Appointment time
                  </p>
                  <p
                    className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-white"
                    data-testid="booking-review-time"
                  >
                    {review.timeLabel}
                  </p>
                </>
              ) : null}
              <p
                className="mt-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200"
                data-testid="booking-review-mode"
              >
                {review.modeLabel}
              </p>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                  Clinic
                </dt>
                <dd className="font-semibold text-neutral-900 dark:text-white">
                  {review.clinicName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                  Provider
                </dt>
                <dd className="font-semibold text-neutral-900 dark:text-white">
                  {review.providerName}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                  Location
                </dt>
                <dd className="font-medium text-neutral-900 dark:text-white">
                  {review.locationLabel}
                </dd>
              </div>
              {review.feeLabel ? (
                <div>
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    Fee
                  </dt>
                  <dd className="font-semibold text-neutral-900 dark:text-white">
                    {review.feeLabel}
                  </dd>
                </div>
              ) : null}
              {documents.length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    Attached documents
                  </dt>
                  <dd className="font-medium text-neutral-900 dark:text-white">
                    {documents.length} file
                    {documents.length === 1 ? "" : "s"} —{" "}
                    {documents.map((d) => d.name).join(", ")}
                  </dd>
                </div>
              ) : null}
              {disease.trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                    Your problem
                  </dt>
                  <dd className="whitespace-pre-wrap font-medium text-neutral-900 dark:text-white">
                    {disease.trim()}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          {isLoggedIn && (
            <p className="text-slate-500 dark:text-slate-400 rounded-lg bg-neutral-100 px-3 py-2 text-xs dark:bg-white/5">
              {profileLoading && !prefilled
                ? "Loading your profile…"
                : "Contact details come from your profile. "}
              {!profileLoading && (
                <Link href="/patient/profile" className="text-blue-600 hover:text-blue-700 dark:text-sky-400 font-semibold font-semibold">
                  Update personal details on your profile
                </Link>
              )}
            </p>
          )}
          {!isLoggedIn && (
            <p className="text-slate-500 dark:text-slate-400 text-xs">
              Already have an account?{" "}
              <Link
                href={`/login/patient?callback=${encodeURIComponent(`/practices/${practice.slug}`)}`}
                className="text-blue-600 hover:text-blue-700 dark:text-sky-400 font-semibold"
              >
                Sign in
              </Link>{" "}
              so this visit appears under My bookings.
            </p>
          )}
          <label className="text-slate-500 dark:text-slate-400 block text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isLoggedIn}
              disabled={isLoggedIn}
              className="form-input mt-1 w-full rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:opacity-80"
            />
          </label>
          <label className="text-slate-500 dark:text-slate-400 block text-sm">
            Mobile {isLoggedIn ? "(from profile)" : "*"}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              readOnly={isLoggedIn}
              disabled={isLoggedIn}
              className="form-input mt-1 w-full rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:opacity-80"
              required={!isLoggedIn}
            />
          </label>
          <label className="text-slate-500 dark:text-slate-400 block text-sm">
            Email (optional)
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isLoggedIn}
              disabled={isLoggedIn}
              className="form-input mt-1 w-full rounded-lg px-3 py-2 disabled:cursor-not-allowed disabled:opacity-80"
            />
          </label>
          <VoiceTextInput
            ref={diseaseVoiceRef}
            label="What is the problem? *"
            value={disease}
            onChange={setDisease}
            placeholder="Describe symptoms, how long, and what you need help with"
            required
            multiline
            rows={3}
            disabled={submitting || uploadingDoc}
            micAriaLabel="Describe your problem by voice"
            listeningHint="Listening… describe your problem or symptoms"
            voiceHint="Tell us the problem in your own words. We’ll prepare a short brief for the doctor."
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Required. Your description is shared with the doctor, and AI prepares a
            clear visit brief in their remarks.
          </p>

          <div className="space-y-2">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Previous prescriptions or reports (optional)
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Upload up to {MAX_BOOKING_DOCUMENTS} files — PDF or images, max
              10 MB each.
            </p>
            {documents.length > 0 ? (
              <ul className="space-y-2" aria-label="Uploaded documents">
                {documents.map((doc, index) => (
                  <li
                    key={`${doc.url}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-white/10"
                  >
                    <span className="truncate font-medium text-neutral-900 dark:text-white">
                      {doc.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDocument(index)}
                      className="shrink-0 text-xs font-semibold text-red-600 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {documents.length < MAX_BOOKING_DOCUMENTS ? (
              <label className="block">
                <input
                  type="file"
                  accept={BOOKING_DOCUMENT_ACCEPT}
                  onChange={(e) => void handleDocumentUpload(e)}
                  disabled={uploadingDoc || submitting}
                  className="sr-only"
                />
                <span className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/5">
                  {uploadingDoc ? "Uploading…" : "Choose file to upload"}
                </span>
              </label>
            ) : null}
          </div>

          {message && (
            <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                diseaseVoiceRef.current?.stopVoice()
                setStep(0)
              }}
              className="min-h-12 flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-800 dark:border-white/20 dark:text-neutral-200"
            >
              Back
            </button>
            <FlipEfButton
              onClick={() => void confirmBooking()}
              disabled={
                submitting ||
                uploadingDoc ||
                !privacyConsent ||
                (isLoggedIn && profileLoading && !prefilled)
              }
              className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 h-12 flex-1 !py-3 disabled:opacity-40"
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </FlipEfButton>
          </div>
        </div>
      )}

      {step === 1 && !review && (
        <div className="space-y-3">
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            Appointment details are missing. Go back and select a slot again.
          </p>
          <button
            type="button"
            onClick={() => setStep(0)}
            className="min-h-12 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold dark:border-white/20"
          >
            Back to slots
          </button>
        </div>
      )}
    </div>
  )
}
