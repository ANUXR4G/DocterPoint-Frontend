"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { legacyPracticeTabHref } from "@/lib/doctorPracticeTabs"
import { ThinkingLoader } from "@/components"
import { proctoService } from "@/lib/services/procto"

const PRACTICE_TYPES = [
  {
    value: "SOLO",
    label: "Solo practitioner",
    hint: "Single doctor practice — no HIS needed; online booking + WhatsApp line.",
  },
  {
    value: "CLINIC",
    label: "Small polyclinic / clinic",
    hint: "Multi-doctor clinic without a hospital HIS — shared calendar & WhatsApp.",
  },
  {
    value: "MEDICAL_CENTER",
    label: "Medical center",
    hint: "Has HIS / EMR offline — GlucoGuide adds online booking & WhatsApp without replacing HIS.",
  },
]

const STEPS = [
  { key: "clinic", label: "Clinic", hint: "Profile & contact" },
  { key: "doctor", label: "Doctor", hint: "Specialty & location" },
  { key: "launch", label: "Launch", hint: "Review & create" },
] as const

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-[var(--theme-primary)] dark:border-neutral-600"

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs opacity-55">{hint}</span> : null}
    </label>
  )
}

export default function OnboardPracticeWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  const [name, setName] = useState("")
  const [type, setType] = useState("SOLO")
  const [specialty, setSpecialty] = useState("Endocrinology")
  const [fee, setFee] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [locationName, setLocationName] = useState("Main Clinic")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [registrationNo, setRegistrationNo] = useState("")
  const [telNo, setTelNo] = useState("")
  const [email, setEmail] = useState("")
  const [doctorName, setDoctorName] = useState("")
  const [validityDays, setValidityDays] = useState("7")
  const [photoUrl, setPhotoUrl] = useState("")

  async function submit() {
    if (
      !name.trim() ||
      !address.trim() ||
      !city.trim() ||
      !registrationNo.trim() ||
      !telNo.trim() ||
      !email.trim()
    ) {
      setMessage(
        "Complete all required fields (name, address, Reg. No, Tel, Email).",
      )
      return
    }
    const feeNum = Number(fee)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setMessage("Appointment / consultation fee (₹) is required.")
      return
    }

    setSubmitting(true)
    setMessage("")

    const days = Number(validityDays)
    const cover = photoUrl.trim() || undefined
    const res = await proctoService.onboardPractice({
      name: name.trim(),
      type,
      specialty: specialty.trim(),
      consultationFee: feeNum,
      whatsappBusinessNumber: whatsapp.trim() || undefined,
      registrationNo: registrationNo.trim(),
      phone: telNo.trim(),
      email: email.trim(),
      doctorName: doctorName.trim() || undefined,
      appointmentValidityDays:
        Number.isFinite(days) && days >= 1 && days <= 90 ? days : 7,
      ...(cover ? { bgSrc: cover, photoUrl: cover } : {}),
      location: {
        name: locationName.trim() || "Main Clinic",
        address: address.trim(),
        city: city.trim(),
      },
    })

    setSubmitting(false)

    if (res.status === "successful") {
      router.push(`${legacyPracticeTabHref("schedule")}&onboarded=1`)
      return
    }
    setMessage(
      res.message ?? "Onboarding failed. Are you logged in as a provider?",
    )
  }

  function goClinicNext() {
    if (
      !name.trim() ||
      !address.trim() ||
      !registrationNo.trim() ||
      !telNo.trim() ||
      !email.trim()
    ) {
      setMessage(
        "Fill clinic name, address, Reg. No, Tel No, and Email.",
      )
      return
    }
    setMessage("")
    setStep(1)
  }

  function goDoctorNext() {
    if (!city.trim()) {
      setMessage("City is required.")
      return
    }
    const feeNum = Number(fee)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setMessage("Appointment / consultation fee (₹) is required.")
      return
    }
    setMessage("")
    setStep(2)
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/50 sm:p-7">
      {submitting ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 py-10">
          <ThinkingLoader size={64} state="working" label="Creating practice" />
          <p className="text-sm font-medium opacity-70">Creating practice…</p>
        </div>
      ) : (
        <>
          {/* Steps */}
          <ol className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {STEPS.map((s, i) => {
              const active = i === step
              const done = i < step
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (i < step) setStep(i)
                    }}
                    disabled={i > step}
                    className={`w-full rounded-xl border px-2 py-3 text-left transition disabled:cursor-default sm:px-3 ${
                      active
                        ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10"
                        : done
                          ? "border-neutral-300 dark:border-neutral-600"
                          : "border-neutral-200 opacity-60 dark:border-neutral-700"
                    }`}
                  >
                    <span
                      className={`mb-1 flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        active || done
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                          : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <p className="text-xs font-semibold sm:text-sm">{s.label}</p>
                    <p className="hidden text-[11px] opacity-55 sm:block">
                      {s.hint}
                    </p>
                  </button>
                </li>
              )
            })}
          </ol>

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Clinic details</h2>
                <p className="mt-1 text-sm opacity-60">
                  Basic profile patients will see when booking.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Clinic name" required>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={fieldClass}
                      placeholder="City Care Clinic"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Address" required>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={fieldClass}
                      placeholder="Street, area"
                    />
                  </Field>
                </div>
                <Field label="Reg. No" required>
                  <input
                    value={registrationNo}
                    onChange={(e) => setRegistrationNo(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Tel No" required>
                  <input
                    value={telNo}
                    onChange={(e) => setTelNo(e.target.value)}
                    className={fieldClass}
                    placeholder="+91…"
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field
                  label="Practice type"
                  hint={
                    PRACTICE_TYPES.find((t) => t.value === type)?.hint
                  }
                >
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className={fieldClass}
                  >
                    {PRACTICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Clinic cover image URL"
                    hint="Optional public image URL shown on the practice page."
                  >
                    <input
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      className={fieldClass}
                      placeholder="https://…"
                    />
                  </Field>
                </div>
              </div>

              {message ? (
                <p className="text-sm text-red-600 dark:text-red-300">{message}</p>
              ) : null}

              <button
                type="button"
                onClick={goClinicNext}
                className="gg-btn mt-2 w-full !py-3 text-sm font-semibold"
              >
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Doctor & location</h2>
                <p className="mt-1 text-sm opacity-60">
                  Specialty, booking window, and clinic location.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Doctor name (Dr.)">
                  <input
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    className={fieldClass}
                    placeholder="Priya Nair"
                  />
                </Field>
                <Field label="Specialty">
                  <input
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field
                  label="Appointment validity (days)"
                  required
                  hint="How far ahead patients can book (1–90)."
                >
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field
                  label="Consultation / appointment fee (₹)"
                  required
                  hint="Shown on WhatsApp when patients text FAQ or ask about fees."
                >
                  <input
                    type="number"
                    min={1}
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className={fieldClass}
                    placeholder="500"
                  />
                </Field>
                <Field label="Location name">
                  <input
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="City" required>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={fieldClass}
                    placeholder="Bangalore"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="WhatsApp business number (optional)">
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className={fieldClass}
                      placeholder="+91…"
                    />
                  </Field>
                </div>
              </div>

              {message ? (
                <p className="text-sm text-red-600 dark:text-red-300">{message}</p>
              ) : null}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("")
                    setStep(0)
                  }}
                  className="flex-1 rounded-xl border border-neutral-300 py-3 text-sm font-semibold dark:border-neutral-600"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goDoctorNext}
                  className="gg-btn flex-1 !py-3 text-sm font-semibold"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Ready to launch</h2>
                <p className="mt-1 text-sm opacity-60">
                  Confirm details, then create the practice.
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-950/50">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                    Clinic
                  </p>
                  <p className="mt-1 text-base font-semibold">{name}</p>
                  <p className="opacity-70">
                    {type.replace(/_/g, " ")} · Reg. {registrationNo}
                  </p>
                </div>
                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                    Contact
                  </p>
                  <p className="mt-1">{telNo}</p>
                  <p className="opacity-80">{email}</p>
                  <p className="opacity-80">
                    {address}
                    {city ? `, ${city}` : ""}
                  </p>
                </div>
                <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                    Care
                  </p>
                  {doctorName ? (
                    <p className="mt-1 font-medium">Dr. {doctorName}</p>
                  ) : null}
                  <p className="opacity-80">
                    {specialty}
                    {fee ? ` · ₹${fee}` : ""} · Book {validityDays}d ahead
                  </p>
                  <p className="opacity-80">{locationName}</p>
                  {whatsapp ? <p className="opacity-80">WhatsApp: {whatsapp}</p> : null}
                  {photoUrl.trim() ? (
                    <p className="opacity-80 truncate">Cover: {photoUrl.trim()}</p>
                  ) : null}
                </div>
              </div>

              <p className="text-xs opacity-55">
                After create: configure your schedule under Practice → Weekly hours.
                After you subscribe, connect your WhatsApp Business number under
                Subscription (Meta Phone Number ID required for production).
              </p>

              {message ? (
                <p className="text-sm text-red-600 dark:text-red-300">{message}</p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMessage("")
                    setStep(1)
                  }}
                  className="flex-1 rounded-xl border border-neutral-300 py-3 text-sm font-semibold dark:border-neutral-600"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  className="flex-1 rounded-xl border border-green-600 bg-green-600 py-3 text-sm font-semibold text-white"
                >
                  Create practice
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
