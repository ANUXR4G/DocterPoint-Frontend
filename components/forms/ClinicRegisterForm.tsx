"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { firey } from "@/utils"
import { cookies } from "@/utils/cookies"
import { userService, type ProfessionalScanResult } from "@/lib/services/user"
import { proctoService } from "@/lib/services/procto"
import { PORTAL_COOKIE } from "@/lib/providerPortal"
import { Button, Icon, IconInput } from "@/components"
import ProfessionalDocumentScan from "@/components/forms/ProfessionalDocumentScan"

type ClinicRegisterFormProps = {
  onSwitchLogin: () => void
}

type DoctorRow = {
  id: string
  name: string
  email: string
  specialty: string
}

type ClinicPlan = {
  id: string
  name: string
  priceMonthlyInr: number
  maxBookingsPerMonth?: number | null
  features?: Record<string, unknown>
}

function newDoctorRow(): DoctorRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    email: "",
    specialty: "",
  }
}

/**
 * Clinic registration:
 * Clinic Name, Address, Reg No, Tel, Email
 * + optional doctors to add to the clinic
 */
export default function ClinicRegisterForm({
  onSwitchLogin,
}: ClinicRegisterFormProps) {
  const router = useRouter()
  const [clinicName, setClinicName] = useState("")
  const [address, setAddress] = useState("")
  const [registrationNo, setRegistrationNo] = useState("")
  const [telNo, setTelNo] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [plans, setPlans] = useState<ClinicPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>("")
  const [plansLoading, setPlansLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void proctoService.listPlans().then((res) => {
      if (cancelled) return
      if (res?.status === "successful" && Array.isArray(res.data)) {
        const rows = res.data as ClinicPlan[]
        setPlans(rows)
        const growth = rows.find((p) => p.name === "Growth")
        setSelectedPlanId(growth?.id ?? rows[0]?.id ?? "")
      }
      setPlansLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function updateDoctor(id: string, patch: Partial<DoctorRow>) {
    setDoctors((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function removeDoctor(id: string) {
    setDoctors((rows) => rows.filter((row) => row.id !== id))
  }

  function applyDocumentScan(data: ProfessionalScanResult) {
    if (data.clinicName) setClinicName(data.clinicName)
    else if (data.name) setClinicName(data.name)
    if (data.address) setAddress(data.address)
    if (data.registrationNo) setRegistrationNo(data.registrationNo)
    else if (data.licenseNo) setRegistrationNo(data.licenseNo)
    if (data.phone) setTelNo(data.phone)
    if (data.email) setEmail(data.email)

    // If a doctor name / specialty is on the card, seed one optional doctor row.
    if (data.name && data.clinicName && data.name !== data.clinicName) {
      setDoctors((rows) => {
        if (rows.some((r) => r.name.trim() || r.email.trim())) return rows
        return [
          {
            ...newDoctorRow(),
            name: data.name!,
            specialty: data.specialty ?? "",
            email: data.email && data.email !== email ? data.email : "",
          },
        ]
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (
      !clinicName.trim() ||
      !address.trim() ||
      !registrationNo.trim() ||
      !telNo.trim() ||
      !email.trim() ||
      !password
    ) {
      setError("Fill Clinic Name, Address, Reg No, Tel, Email, and password.")
      return
    }

    const filledDoctors = doctors.filter((d) => d.name.trim() || d.email.trim())
    for (const d of filledDoctors) {
      if (!d.name.trim() || !d.email.trim()) {
        setError("Each added doctor needs both name and email.")
        return
      }
    }
    if (filledDoctors.length > 0) {
      setError(
        "Extra doctors are added after you subscribe to Growth or Clinic. Clear the doctor list, create the clinic, then open Billing → Doctors.",
      )
      return
    }

    if (!selectedPlanId) {
      setError("Choose a subscription plan to continue.")
      return
    }

    setSubmitting(true)

    try {
      const encryptedPass = await firey.generateEncryption(password)
      const signup = await userService.signup({
        email: email.trim(),
        password: encryptedPass,
        role: "doctor",
        name: clinicName.trim(),
        phone: telNo.trim(),
      })

      if (!signup || signup.status === "unsuccessful" || !signup.role) {
        setError(signup?.message ?? "Could not create clinic account.")
        setSubmitting(false)
        return
      }

      cookies.setCookie(PORTAL_COOKIE, "clinic", 60 * 60 * 24 * 30)

      const cityGuess =
        address
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .at(-1) || "India"

      const onboard = await proctoService.onboardPractice({
        name: clinicName.trim(),
        type: "CLINIC",
        specialty: "General",
        registrationNo: registrationNo.trim(),
        phone: telNo.trim(),
        email: email.trim(),
        location: {
          name: "Main Clinic",
          address: address.trim(),
          city: cityGuess,
        },
      })

      setSubmitting(false)

      if (onboard?.status === "successful") {
        const planQs = selectedPlanId
          ? `&subscribePlan=${encodeURIComponent(selectedPlanId)}`
          : ""
        router.push(
          `/clinic/subscription?onboarded=1${planQs}`,
        )
        return
      }

      setError(onboard?.message ?? "Clinic account created — finish setup next.")
      router.push("/clinic/dashboard")
    } catch {
      setSubmitting(false)
      setError("Registration failed. Try again.")
    }
  }

  return (
    <form className="mt-4 w-full min-w-0 text-left sm:mt-5" onSubmit={handleSubmit}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        1. Document scan (optional)
      </p>
      <ProfessionalDocumentScan
        audience="clinic"
        onExtract={applyDocumentScan}
      />

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        2. Clinic details
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <IconInput
          icon="home"
          name="clinicName"
          label="Clinic Name *"
          value={clinicName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClinicName(e.target.value)
          }
        />
        <IconInput
          icon="written-page"
          name="registrationNo"
          label="Reg No *"
          value={registrationNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRegistrationNo(e.target.value)
          }
        />
        <div className="min-w-0 min-[480px]:col-span-2">
          <IconInput
            icon="pin"
            name="address"
            label="Address *"
            value={address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setAddress(e.target.value)
            }
          />
        </div>
        <IconInput
          icon="phone"
          name="telNo"
          label="Tel *"
          value={telNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setTelNo(e.target.value)
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
          label="Account password *"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setPassword(e.target.value)
          }
        />
      </div>

      <div className="mt-6 flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0099ff]">
          3. Doctors in this clinic
        </p>
        <button
          type="button"
          onClick={() => setDoctors((rows) => [...rows, newDoctorRow()])}
          className="w-full rounded-full border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100 min-[400px]:w-auto dark:border-[#333] dark:text-white dark:hover:bg-[#1c1c1c]"
        >
          + Add doctor
        </button>
      </div>
      <p className="gg-muted mt-1 text-xs">
        Optional draft only — multi-doctor requires Growth or Clinic. Clear this
        list to register, then add doctors under Practice after you subscribe.
      </p>

      {doctors.length === 0 ? (
        <p className="gg-faint mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm dark:border-[#333]">
          No doctors added yet. Click “Add doctor” to include providers.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {doctors.map((doc, index) => (
            <li
              key={doc.id}
              className="rounded-xl border border-neutral-200 p-3 dark:border-[#262626]"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">
                  Doctor {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeDoctor(doc.id)}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
                <IconInput
                  icon="doctor"
                  name={`doctor-name-${doc.id}`}
                  label="Doctor name *"
                  value={doc.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateDoctor(doc.id, { name: e.target.value })
                  }
                />
                <IconInput
                  icon="envelope"
                  name={`doctor-email-${doc.id}`}
                  label="Doctor email *"
                  value={doc.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateDoctor(doc.id, { email: e.target.value })
                  }
                />
                <IconInput
                  icon="written-page"
                  name={`doctor-specialty-${doc.id}`}
                  label="Specialty"
                  value={doc.specialty}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateDoctor(doc.id, { specialty: e.target.value })
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        4. Subscription plan
      </p>
      <p className="gg-muted mb-3 text-xs">
        Pick a plan now — after registration you&apos;ll complete payment
        (or start a trial from Billing).
      </p>
      {plansLoading ? (
        <div className="h-28 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-[#333] dark:bg-[#1c1c1c]" />
      ) : plans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-[#333]">
          Plans unavailable — you can subscribe after registration from Billing.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const selected = selectedPlanId === plan.id
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-[#0099ff] bg-[#0099ff]/5 shadow-[0_0_0_1px_#0099ff]"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-[#333] dark:hover:border-[#444]"
                }`}
              >
                <p className="font-semibold text-neutral-900 dark:text-white">
                  {plan.name}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  ₹{plan.priceMonthlyInr.toLocaleString("en-IN")}
                  <span className="text-sm font-medium text-neutral-500">
                    /mo
                  </span>
                </p>
                {plan.maxBookingsPerMonth ? (
                  <p className="mt-2 text-xs text-neutral-500">
                    Up to {plan.maxBookingsPerMonth} bookings / month
                  </p>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

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
            "Register & continue to payment"
          )}
        </Button>
      </div>

      <p className="gg-muted mt-4 text-center text-sm">
        Already registered?{" "}
        <button type="button" onClick={onSwitchLogin} className="gg-link">
          Clinic login
        </button>
      </p>
    </form>
  )
}
