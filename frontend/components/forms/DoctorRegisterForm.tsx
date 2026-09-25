"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { Button, Icon, IconInput } from "@/components"
import ProfessionalDocumentScan from "@/components/forms/ProfessionalDocumentScan"
import type { ProfessionalScanResult } from "@/lib/services/user"
import { PORTAL_COOKIE } from "@/lib/providerPortal"

type DoctorRegisterFormProps = {
  onSwitchLogin: () => void
}

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const

/**
 * Doctor registration fields:
 * Dr Name, Dr license number, Booking Type (Token/Time),
 * Working days, working time, break time, per slot duration,
 * patients per slot, appointment validity (days).
 */
export default function DoctorRegisterForm({
  onSwitchLogin,
}: DoctorRegisterFormProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [licenseNo, setLicenseNo] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [consultationFee, setConsultationFee] = useState("500")
  const [bookingType, setBookingType] = useState<"TIME" | "TOKEN">("TIME")
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("17:00")
  const [breakStartTime, setBreakStartTime] = useState("13:00")
  const [breakEndTime, setBreakEndTime] = useState("14:00")
  const [slotDurationMins, setSlotDurationMins] = useState("15")
  const [patientsPerSlot, setPatientsPerSlot] = useState("1")
  const [appointmentValidityDays, setAppointmentValidityDays] = useState("7")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function applyDocumentScan(data: ProfessionalScanResult) {
    if (data.name) setName(data.name.trim())
    if (data.licenseNo) setLicenseNo(data.licenseNo.trim())
    else if (data.registrationNo) setLicenseNo(data.registrationNo.trim())
    if (data.email) setEmail(data.email.trim().toLowerCase())
    if (data.phone) setPhone(data.phone.trim())
    if (data.address) setAddress(data.address.trim())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const fee = Number(consultationFee)
    if (!name.trim() || !licenseNo.trim() || !email.trim() || !password) {
      setError("Fill Dr Name, license number, email, and password.")
      return
    }
    const phoneDigits = phone.replace(/\D/g, "").slice(-10)
    if (phoneDigits.length !== 10) {
      setError(
        "Enter a valid 10-digit mobile — this becomes your WhatsApp bot number.",
      )
      return
    }
    if (!address.trim()) {
      setError("Enter your clinic / practice address.")
      return
    }
    if (!Number.isFinite(fee) || fee <= 0) {
      setError("Enter a consultation fee greater than 0.")
      return
    }
    if (workingDays.length === 0) {
      setError("Select at least one working day.")
      return
    }
    if (!startTime || !endTime || startTime >= endTime) {
      setError("Working end time must be after start time.")
      return
    }
    if (
      (breakStartTime && !breakEndTime) ||
      (!breakStartTime && breakEndTime) ||
      (breakStartTime && breakEndTime && breakStartTime >= breakEndTime)
    ) {
      setError("Break end must be after break start (or clear both).")
      return
    }

    setSubmitting(true)
    try {
      const encryptedPass = await firey.generateEncryption(password)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API}/auth/register/doctor`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            licenseNo: licenseNo.trim(),
            email: email.trim(),
            password: encryptedPass,
            phone: phoneDigits,
            address: address.trim(),
            city: city.trim() || undefined,
            consultationFee: fee,
            bookingType,
            workingDays,
            startTime,
            endTime,
            breakStartTime: breakStartTime || undefined,
            breakEndTime: breakEndTime || undefined,
            slotDurationMins: Number(slotDurationMins) || 15,
            patientsPerSlot: Number(patientsPerSlot) || 1,
            appointmentValidityDays: (() => {
              const days = Number(appointmentValidityDays)
              return Number.isFinite(days) && days >= 1 && days <= 90 ? days : 7
            })(),
          }),
        },
      )
      const data = await res.json().catch(() => null)
      setSubmitting(false)

      if (!res.ok || data?.status === "unsuccessful" || !data?.role) {
        setError(data?.message ?? "Doctor registration failed.")
        return
      }

      cookies.setCookie(PORTAL_COOKIE, "doctor", 60 * 60 * 24 * 30)
      const { proctoService } = await import("@/lib/services/procto")
      proctoService.invalidateMyPracticesCache()
      // VERIFYING lines need in-app Meta OTP under Billing / Subscription.
      router.push("/doctor/subscription?waVerify=1")
    } catch {
      setSubmitting(false)
      setError("Registration failed. Try again.")
    }
  }

  return (
    <form className="mt-4 w-full min-w-0 text-left sm:mt-5" onSubmit={handleSubmit}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        1. Document scan (optional)
      </p>
      <ProfessionalDocumentScan
        audience="doctor"
        onExtract={applyDocumentScan}
      />

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        2. Doctor profile
      </p>
      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        This creates your own independent practice and dashboard (with a 14-day
        trial). Clinics cannot add this account to their roster — clinic staff
        are created from the clinic dashboard only.
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <IconInput
          icon="doctor"
          name="drName"
          label="Dr Name *"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setName(e.target.value)
          }
        />
        <IconInput
          icon="written-page"
          name="licenseNo"
          label="Dr license number *"
          value={licenseNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setLicenseNo(e.target.value)
          }
        />
        <IconInput
          icon="envelope"
          name="email"
          label="Email *"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEmail(e.target.value)
          }
        />
        <IconInput
          icon="key"
          name="password"
          type="password"
          label="Password *"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPassword(e.target.value)
          }
        />
        <IconInput
          icon="phone"
          name="phone"
          label="Mobile (WhatsApp bot) *"
          value={phone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPhone(e.target.value)
          }
        />
        <IconInput
          icon="written-page"
          name="consultationFee"
          type="number"
          label="Consultation fee (₹) *"
          value={consultationFee}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConsultationFee(e.target.value)
          }
        />
        <div className="min-[480px]:col-span-2">
          <IconInput
            icon="written-page"
            name="address"
            label="Clinic / practice address *"
            value={address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setAddress(e.target.value)
            }
          />
        </div>
        <IconInput
          icon="written-page"
          name="city"
          label="City"
          value={city}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setCity(e.target.value)
          }
        />
      </div>

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        3. Booking type
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {(
          [
            ["TIME", "Time slots"],
            ["TOKEN", "Token queue"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBookingType(id)}
            className={`min-h-12 rounded-xl border px-2 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${
              bookingType === id
                ? "border-[#0099ff] bg-[#0099ff]/10 text-neutral-900 dark:text-white"
                : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs opacity-60">
        Choose one mode — time slots or token queue, not both.
      </p>

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
        Working days
      </p>
      <div className="grid grid-cols-4 gap-2 min-[400px]:grid-cols-7 sm:flex sm:flex-wrap">
        {WEEKDAYS.map((day) => {
          const active = workingDays.includes(day.value)
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`min-h-11 rounded-full px-2 py-2 text-sm font-semibold transition sm:min-w-[3rem] sm:px-3 ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-[#0f172a]"
                  : "border border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
              }`}
            >
              {day.label}
            </button>
          )
        })}
      </div>

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
        Working time
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <label className="block text-sm">
          <span className="gg-muted text-xs font-medium">Start *</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="gg-muted text-xs font-medium">End *</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-sm"
          />
        </label>
      </div>

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
        Break time (interval)
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <label className="block min-w-0 text-sm">
          <span className="gg-muted text-xs font-medium">Break start</span>
          <input
            type="time"
            value={breakStartTime}
            onChange={(e) => setBreakStartTime(e.target.value)}
            className="form-input mt-1 h-14 w-full min-w-0 px-4 text-sm"
          />
        </label>
        <label className="block min-w-0 text-sm">
          <span className="gg-muted text-xs font-medium">Break end</span>
          <input
            type="time"
            value={breakEndTime}
            onChange={(e) => setBreakEndTime(e.target.value)}
            className="form-input mt-1 h-14 w-full min-w-0 px-4 text-sm"
          />
        </label>
      </div>

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
        Slot settings
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <label className="block min-w-0 text-sm">
          <span className="gg-muted text-xs font-medium">
            Per slot duration (mins) *
          </span>
          <input
            type="number"
            min={5}
            max={120}
            value={slotDurationMins}
            onChange={(e) => setSlotDurationMins(e.target.value)}
            className="form-input mt-1 h-14 w-full min-w-0 px-4 text-sm"
          />
        </label>
        <label className="block min-w-0 text-sm">
          <span className="gg-muted text-xs font-medium">
            No. of patients in slots *
          </span>
          <input
            type="number"
            min={1}
            max={50}
            value={patientsPerSlot}
            onChange={(e) => setPatientsPerSlot(e.target.value)}
            className="form-input mt-1 h-14 w-full min-w-0 px-4 text-sm"
          />
        </label>
        <label className="block min-w-0 text-sm min-[480px]:col-span-2">
          <span className="gg-muted text-xs font-medium">
            Appointment validity (days) *
          </span>
          <input
            type="number"
            min={1}
            max={90}
            value={appointmentValidityDays}
            onChange={(e) => setAppointmentValidityDays(e.target.value)}
            className="form-input mt-1 h-14 w-full min-w-0 px-4 text-sm"
          />
          <span className="gg-faint mt-1 block text-xs">
            How far ahead patients can book (1–90 days). Default 7.
          </span>
        </label>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-2xl bg-red-500/15 py-2.5 text-center"
        >
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        </motion.div>
      )}

      <div className="mt-5 flex justify-center">
        <Button
          className="gg-btn center !w-full !border-transparent !py-3.5 !text-base sm:!w-auto sm:min-w-[220px]"
          typeBtn="submit"
          disabled={submitting}
        >
          {submitting ? (
            <div className="size-5">
              <Icon
                name="spinning-loader"
                className="fill-white dark:fill-black"
              />
            </div>
          ) : (
            "Register doctor"
          )}
        </Button>
      </div>

      <p className="gg-muted mt-4 text-center text-sm">
        Already registered?{" "}
        <button type="button" onClick={onSwitchLogin} className="gg-link">
          Doctor login
        </button>
      </p>
    </form>
  )
}
