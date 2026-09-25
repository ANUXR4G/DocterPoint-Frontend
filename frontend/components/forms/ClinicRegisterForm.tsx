"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

type ClinicPlan = {
  id: string
  name: string
  priceMonthlyInr: number
  maxBookingsPerMonth?: number | null
  features?: Record<string, unknown>
}

/**
 * Clinic registration creates the owner account + CLINIC practice + trial.
 * Doctors are added later from the clinic dashboard (never by linking
 * independently registered doctor accounts).
 */
export default function ClinicRegisterForm({
  onSwitchLogin,
}: ClinicRegisterFormProps) {
  const router = useRouter()
  const [clinicName, setClinicName] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [consultationFee, setConsultationFee] = useState("500")
  const [registrationNo, setRegistrationNo] = useState("")
  const [telNo, setTelNo] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
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

  function applyDocumentScan(data: ProfessionalScanResult) {
    if (data.clinicName) setClinicName(data.clinicName)
    else if (data.name) setClinicName(data.name)
    if (data.address) setAddress(data.address)
    if (data.registrationNo) setRegistrationNo(data.registrationNo)
    else if (data.licenseNo) setRegistrationNo(data.licenseNo)
    if (data.phone) setTelNo(data.phone)
    if (data.email) setEmail(data.email)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const fee = Number(consultationFee)
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
    if (!Number.isFinite(fee) || fee <= 0) {
      setError("Enter a consultation fee greater than 0.")
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
        portal: "clinic",
        name: clinicName.trim(),
        phone: telNo.trim(),
      })

      if (!signup || signup.status === "unsuccessful" || !signup.role) {
        setError(signup?.message ?? "Could not create clinic account.")
        setSubmitting(false)
        return
      }

      cookies.setCookie(PORTAL_COOKIE, "clinic", 60 * 60 * 24 * 30)
      proctoService.invalidateMyPracticesCache()

      const cityResolved =
        city.trim() ||
        address
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .at(-1) ||
        "India"

      const onboard = await proctoService.onboardPractice({
        name: clinicName.trim(),
        type: "CLINIC",
        specialty: "General",
        consultationFee: fee,
        registrationNo: registrationNo.trim(),
        phone: telNo.trim(),
        email: email.trim(),
        planId: selectedPlanId,
        location: {
          name: "Main Clinic",
          address: address.trim(),
          city: cityResolved,
        },
      })

      setSubmitting(false)

      if (onboard?.status === "successful") {
        proctoService.invalidateMyPracticesCache()
        router.push("/clinic/subscription?waVerify=1")
        return
      }

      setError(
        onboard?.message ??
          "Clinic account created, but practice setup failed. Open the clinic dashboard to finish.",
      )
      router.push("/clinic/dashboard")
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
        audience="clinic"
        onExtract={applyDocumentScan}
      />

      <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        2. Clinic details
      </p>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <IconInput
          icon="doctor"
          name="clinicName"
          label="Clinic name *"
          value={clinicName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClinicName(e.target.value)
          }
        />
        <IconInput
          icon="written-page"
          name="registrationNo"
          label="Registration no. *"
          value={registrationNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRegistrationNo(e.target.value)
          }
        />
        <div className="min-[480px]:col-span-2">
          <IconInput
            icon="written-page"
            name="address"
            label="Address *"
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
        <IconInput
          icon="written-page"
          name="consultationFee"
          label="Consultation fee (₹) *"
          type="number"
          value={consultationFee}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConsultationFee(e.target.value)
          }
        />
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

      <div className="mt-6 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-slate-700 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-200">
        <p className="font-semibold text-slate-900 dark:text-white">
          Ready after registration
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Your clinic, location, fee, and 14-day trial start here. Then add
          doctor logins from the clinic dashboard — they sign in at Doctor Login
          under this clinic. Independently registered doctors cannot be linked.
        </p>
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        3. Choose a plan (starts as free trial)
      </p>
      {plansLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading plans…</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {plans.map((plan) => {
            const selected = plan.id === selectedPlanId
            return (
              <li key={plan.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_12%,white)] shadow-sm dark:border-[var(--theme-primary)] dark:bg-[color-mix(in_srgb,var(--theme-primary)_22%,#1e293b)] dark:shadow-none"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-800 dark:hover:border-white/20 dark:hover:bg-slate-800/90"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      selected
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      selected
                        ? "text-slate-600 dark:text-slate-300"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    ₹{plan.priceMonthlyInr}/mo · 14-day trial
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            "Create clinic account"
          )}
        </Button>
        <button
          type="button"
          onClick={onSwitchLogin}
          className="text-sm font-medium text-blue-600 hover:underline dark:text-sky-400"
        >
          Already have a clinic? Log in
        </button>
      </div>
    </form>
  )
}
