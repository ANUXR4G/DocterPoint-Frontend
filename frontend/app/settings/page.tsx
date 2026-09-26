"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button, Icon, IconInput, ThemeUI } from "@/components"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { PracticeManagementPanel } from "@/components/ui/doctors/pages/PracticeManagementPanel"
import BookingModeChangeModal from "@/components/ui/procto/BookingModeChangeModal"
import { PracticeDashboardProvider } from "@/contexts/PracticeDashboardContext"
import { useRole } from "@/hooks/useRole"
import { useUser } from "@/hooks/useUser"
import { proctoService } from "@/lib/services/procto"

type Tab = "settings" | "practice" | "theme"

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const

const sectionLabel =
  "mb-3 text-sm font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-sky-400"

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="dashboard-page-wide p-6 text-sm opacity-70">
          Loading settings…
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  )
}

function SettingsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const [tab, setTab] = useState<Tab>("settings")
  const [hydrated, setHydrated] = useState(false)
  const role = useRole()

  useEffect(() => {
    setHydrated(true)
  }, [])

  const subtitle = hydrated
    ? role === "user"
      ? "Customize appearance and theme for your account."
      : "Update your registration details or customize appearance."
    : "Customize your account and appearance."

  const isPatient = hydrated && (role === "user" || role === "admin")
  const isProvider =
    hydrated && (role === "doctor" || role === "clinic" || role === "admin")

  useEffect(() => {
    if (tabParam === "practice" && isProvider) {
      setTab("practice")
    } else if (tabParam === "theme" || isPatient) {
      setTab("theme")
    } else if (tabParam === "settings") {
      setTab("settings")
    }
  }, [tabParam, isPatient, isProvider])

  useEffect(() => {
    if (isPatient) setTab("theme")
  }, [isPatient])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === "practice") {
      router.replace("/settings?tab=practice&subtab=calendar", { scroll: false })
      return
    }
    router.replace(`/settings?tab=${next}`, { scroll: false })
  }

  const settingsTabs = isPatient
    ? ([{ id: "theme" as const, label: "Theme" }] as const)
    : isProvider
      ? ([
          { id: "settings" as const, label: "Account" },
          { id: "practice" as const, label: "Practice" },
          { id: "theme" as const, label: "Theme" },
        ] as const)
      : ([
          { id: "settings" as const, label: "Settings" },
          { id: "theme" as const, label: "Theme" },
        ] as const)

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Account"
        title="Settings"
        subtitle={subtitle}
      />

      <div className="flex gap-2 border-b border-slate-200 pb-2 dark:border-white/10">
        {settingsTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-slate-600 hover:bg-sky-50 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "theme" || isPatient ? (
        <div className="dashboard-panel mt-5 w-full max-w-4xl">
          <div className="mb-4">
            <h2 className="dashboard-section-title text-lg">Appearance</h2>
            <p className="dashboard-section-sub">
              Choose light/dark mode, accent colour, and text size for your
              account.
            </p>
          </div>
          <ThemeUI />
        </div>
      ) : tab === "practice" && isProvider ? (
        <div className="dashboard-panel mt-5 w-full max-w-6xl">
          <div className="mb-4">
            <h2 className="dashboard-section-title text-lg">Practice</h2>
            <p className="dashboard-section-sub">
              Schedule, hours, doctors, and WhatsApp inbox.
            </p>
          </div>
          <PracticeDashboardProvider>
            <PracticeManagementPanel embedded />
          </PracticeDashboardProvider>
        </div>
      ) : (
        <div
          className={`dashboard-panel mt-5 w-full ${
            hydrated && role === "doctor" ? "max-w-5xl" : "max-w-3xl"
          }`}
        >
          {!hydrated ? (
            <p className="text-base font-medium opacity-80">Loading settings…</p>
          ) : role === "doctor" ? (
            <DoctorOrClinicAccountSettings />
          ) : (
            <p className="text-base font-medium opacity-80">
              Sign in as a patient, doctor, or clinic to edit account details.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

type Membership = {
  role: string
  userId: string
  practice: {
    id: string
    name: string
    type?: string
    registrationNo?: string | null
    phone?: string | null
    email?: string | null
    consultationFee?: number | null
    whatsappBusinessNumber?: string | null
    locations: { id: string; name: string; address: string; city: string }[]
    members: Array<{
      userId: string
      role: string
      user: {
        id: string
        name: string | null
        email?: string | null
        doctor?: {
          licenseNo: string | null
          appointmentValidityDays: number
          description?: string | null
        } | null
      }
    }>
  }
}

function DoctorOrClinicAccountSettings() {
  const { data: userInfo } = useUser("doctor")
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    const res = await proctoService.getMyPractices()
    if (res.status === "successful") setMemberships(res.data ?? [])
  }

  useEffect(() => {
    void reload().finally(() => setLoading(false))
  }, [])

  const membership = memberships[0]
  const showClinicForm =
    membership &&
    (membership.role === "PRACTICE_OWNER" ||
      membership.role === "PRACTICE_ADMIN") &&
    membership.practice.type === "CLINIC"

  if (loading) {
    return (
      <p className="text-base font-medium opacity-80">Loading account details…</p>
    )
  }

  if (!membership) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-neutral-300 p-5 dark:border-neutral-600">
        <p className="text-base font-medium">No practice linked to this account</p>
        <p className="text-sm opacity-70">
          There are two doctor types:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm opacity-80">
          <li>
            <strong>Independent doctor</strong> — register at Doctor Login
            (creates your own solo practice).
          </li>
          <li>
            <strong>Clinic doctor</strong> — created by a clinic from their
            dashboard (you use Doctor Login with the email/password they set).
          </li>
        </ul>
        <p className="text-sm opacity-70">
          If you just re-seeded the database, sign out and sign in again so your
          session matches the new accounts.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/login/doctor?mode=register"
            className="inline-flex h-10 items-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white"
          >
            Register independent doctor
          </Link>
          <Link
            href="/login/clinic?mode=register"
            className="inline-flex h-10 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold dark:border-neutral-600"
          >
            Register clinic
          </Link>
          <Link
            href="/login/doctor"
            className="inline-flex h-10 items-center rounded-lg border border-neutral-300 px-4 text-sm font-semibold dark:border-neutral-600"
          >
            Doctor login
          </Link>
        </div>
      </div>
    )
  }

  if (showClinicForm) {
    return (
      <ClinicAccountForm membership={membership} onReload={reload} />
    )
  }

  return (
    <DoctorAccountForm
      membership={membership}
      userId={userInfo?.id ?? membership.userId}
    />
  )
}

function ClinicAccountForm({
  membership,
  onReload,
}: {
  membership: Membership
  onReload: () => Promise<void>
}) {
  const loc = membership.practice.locations[0]
  const [clinicName, setClinicName] = useState(membership.practice.name)
  const [address, setAddress] = useState(loc?.address ?? "")
  const [registrationNo, setRegistrationNo] = useState(
    membership.practice.registrationNo ?? "",
  )
  const [telNo, setTelNo] = useState(membership.practice.phone ?? "")
  const [email, setEmail] = useState(membership.practice.email ?? "")
  const [consultationFee, setConsultationFee] = useState(
    membership.practice.consultationFee != null
      ? String(membership.practice.consultationFee)
      : "",
  )
  const [waBotPhone, setWaBotPhone] = useState<string | null>(
    membership.practice.whatsappBusinessNumber?.replace(/\D/g, "").slice(-10) ||
      null,
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newSpecialty, setNewSpecialty] = useState("")
  const [adding, setAdding] = useState(false)
  const [canAddDoctor, setCanAddDoctor] = useState(true)
  const [planHint, setPlanHint] = useState("")

  const doctors = membership.practice.members.filter((m) => m.role === "DOCTOR")
  const doctorSlots = membership.practice.members.filter(
    (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
  )

  useEffect(() => {
    setClinicName(membership.practice.name)
    setAddress(membership.practice.locations[0]?.address ?? "")
    setRegistrationNo(membership.practice.registrationNo ?? "")
    const bot =
      membership.practice.whatsappBusinessNumber?.replace(/\D/g, "").slice(-10) ||
      null
    setWaBotPhone(bot)
    setTelNo(bot || membership.practice.phone || "")
    setEmail(membership.practice.email ?? "")
    setConsultationFee(
      membership.practice.consultationFee != null
        ? String(membership.practice.consultationFee)
        : "",
    )
  }, [membership])

  useEffect(() => {
    let cancelled = false
    void proctoService.getPracticeBilling(membership.practice.id).then((res) => {
      if (cancelled || res?.status !== "successful" || !res.data) return
      const practice = (
        res.data as {
          practice?: {
            phone?: string | null
            whatsappBusinessNumber?: string | null
            whatsappNumber?: { phoneNumber?: string; status?: string } | null
          }
          entitlement?: {
            usable?: boolean
            features?: Record<string, unknown>
          }
        }
      ).practice
      const bot =
        practice?.whatsappNumber?.phoneNumber?.replace(/\D/g, "").slice(-10) ||
        practice?.whatsappBusinessNumber?.replace(/\D/g, "").slice(-10) ||
        null
      if (bot) {
        setWaBotPhone(bot)
        setTelNo(bot)
      }
      const ent = (
        res.data as {
          entitlement?: {
            usable?: boolean
            features?: Record<string, unknown>
          }
        }
      ).entitlement
      const multi =
        ent?.features?.multiDoctor === true ||
        ent?.features?.multiDoctor === 1
      if (!ent?.usable) {
        setCanAddDoctor(false)
        setPlanHint(
          "Active subscription required to add doctors. Open Subscription.",
        )
      } else if (doctorSlots.length >= 1 && !multi) {
        setCanAddDoctor(false)
        setPlanHint(
          "Multi-doctor clinics require Growth or Clinic. Upgrade under Subscription.",
        )
      } else {
        setCanAddDoctor(true)
        setPlanHint("")
      }
    })
    return () => {
      cancelled = true
    }
  }, [membership.practice.id, doctorSlots.length])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (
      !clinicName.trim() ||
      !address.trim() ||
      !registrationNo.trim() ||
      !(waBotPhone || telNo).trim() ||
      !email.trim()
    ) {
      setError("Fill Clinic Name, Address, Reg No, Tel, and Email.")
      return
    }
    const feeNum = Number(consultationFee)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setError("Appointment / consultation fee (₹) is required and must be greater than 0.")
      return
    }
    setSaving(true)
    const phoneToSave =
      (waBotPhone || telNo).replace(/\D/g, "").slice(-10) || telNo.trim()
    const res = await proctoService.updatePracticeProfile(
      membership.practice.id,
      {
        name: clinicName.trim(),
        registrationNo: registrationNo.trim(),
        phone: phoneToSave,
        email: email.trim(),
        consultationFee: feeNum,
        location: {
          id: loc?.id,
          address: address.trim(),
          city:
            address
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
              .at(-1) || loc?.city,
        },
      },
    )
    setSaving(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not update clinic details.")
      return
    }
    setMessage("Clinic details saved.")
    await onReload()
  }

  async function addDoctor() {
    setError("")
    setMessage("")
    if (!canAddDoctor) {
      setError(planHint || "Upgrade your plan to add more doctors.")
      return
    }
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setError("Doctor name, email, and password are required for login.")
      return
    }
    if (newPassword.trim().length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    setAdding(true)
    const res = await proctoService.addPracticeDoctor(membership.practice.id, {
      name: newName.trim(),
      email: newEmail.trim(),
      password: newPassword.trim(),
      specialty: newSpecialty.trim() || undefined,
    })
    setAdding(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not add doctor.")
      return
    }
    setNewName("")
    setNewEmail("")
    setNewPassword("")
    setNewSpecialty("")
    setMessage(
      "Doctor added. They can sign in with the email and password you set.",
    )
    await onReload()
  }

  async function removeDoctor(userId: string) {
    setError("")
    const res = await proctoService.setPracticeMemberActive(
      membership.practice.id,
      userId,
      false,
    )
    if (res.status !== "successful") {
      setError(res.message || "Could not deactivate doctor.")
      return
    }
    setMessage("Doctor deactivated.")
    await onReload()
  }

  return (
    <form className="w-full text-left" onSubmit={(e) => void save(e)}>
      <p className={sectionLabel}>Clinic details</p>
      <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <IconInput
          icon="home"
          name="clinicName"
          label="Clinic Name *"
          value={clinicName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClinicName(e.target.value)
          }
          className="w-full min-w-0"
        />
        <IconInput
          icon="written-page"
          name="registrationNo"
          label="Reg No *"
          value={registrationNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRegistrationNo(e.target.value)
          }
          className="w-full min-w-0"
        />
        <div className="sm:col-span-2">
          <IconInput
            icon="pin"
            name="address"
            label="Address *"
            value={address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setAddress(e.target.value)
            }
            className="w-full min-w-0"
          />
        </div>
        <div className="min-w-0">
          <IconInput
            icon="phone"
            name="telNo"
            label={
              waBotPhone
                ? "Tel * (WhatsApp booking number)"
                : "Tel *"
            }
            value={waBotPhone || telNo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (waBotPhone) return
              setTelNo(e.target.value)
            }}
            className="w-full min-w-0"
            disabled={Boolean(waBotPhone)}
            readOnly={Boolean(waBotPhone)}
          />
          {waBotPhone ? (
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              Locked to your clinic WhatsApp bot line. Patients message this
              number. Change it under Billing → WhatsApp, or ask admin to
              reassign the pool number.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              After you connect WhatsApp under Billing, this Tel becomes your
              public WhatsApp booking number automatically.
            </p>
          )}
        </div>
        <IconInput
          icon="envelope"
          name="email"
          label="Email *"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEmail(e.target.value)
          }
          className="w-full min-w-0"
        />
        <IconInput
          icon="written-page"
          name="consultationFee"
          label="Appointment fee (₹) *"
          type="number"
          value={consultationFee}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConsultationFee(e.target.value)
          }
          className="w-full min-w-0"
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Shown when patients text *FAQ* or ask about fees on WhatsApp.
      </p>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`${sectionLabel} !mb-0`}>Doctors in this clinic</p>
          <p className="mt-1 text-base font-semibold text-neutral-900 dark:text-white">
            Manage doctors linked to this clinic — same fields as registration.
          </p>
        </div>
      </div>

      {doctors.length === 0 ? (
        <p className="gg-faint mt-3 rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-base font-semibold dark:border-[#333]">
          No doctors added yet.
        </p>
      ) : (
        <ul className="mt-4 w-full space-y-3">
          {doctors.map((doc, index) => (
            <li
              key={doc.userId}
              className="w-full rounded-xl border border-neutral-200 p-4 dark:border-[#262626]"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-bold uppercase tracking-wide text-neutral-500">
                  Doctor {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => void removeDoctor(doc.userId)}
                  className="shrink-0 text-sm font-bold text-red-600 hover:underline dark:text-red-400"
                >
                  Deactivate
                </button>
              </div>
              <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
                <IconInput
                  icon="doctor"
                  name={`doctor-name-${doc.userId}`}
                  label="Doctor name *"
                  value={doc.user.name ?? ""}
                  onChange={() => {}}
                  disabled
                  className="w-full min-w-0"
                />
                <IconInput
                  icon="envelope"
                  name={`doctor-email-${doc.userId}`}
                  label="Doctor email *"
                  value={doc.user.email ?? ""}
                  onChange={() => {}}
                  disabled
                  className="w-full min-w-0"
                />
                <IconInput
                  icon="written-page"
                  name={`doctor-specialty-${doc.userId}`}
                  label="Specialty"
                  value={
                    doc.user.doctor?.description?.split("—")[0]?.trim() ?? ""
                  }
                  onChange={() => {}}
                  disabled
                  className="w-full min-w-0 md:col-span-2 xl:col-span-1"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 w-full rounded-xl border border-neutral-200 p-4 dark:border-[#262626]">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-500">
          Add doctor
        </p>
        <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
          Set email and password for the doctor&apos;s portal login.
        </p>
        {planHint ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {planHint}{" "}
            <a
              href="/doctor/subscription"
              className="font-semibold underline"
            >
              Open Subscription
            </a>
          </p>
        ) : null}
        {!canAddDoctor ? (
          <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
            Upgrade your plan to add more doctors.
          </p>
        ) : (
          <>
            <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
              <IconInput
                icon="doctor"
                name="new-doctor-name"
                label="Doctor name *"
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewName(e.target.value)
                }
                className="w-full min-w-0"
              />
              <IconInput
                icon="envelope"
                name="new-doctor-email"
                label="Login email *"
                value={newEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewEmail(e.target.value)
                }
                className="w-full min-w-0"
              />
              <IconInput
                icon="key"
                name="new-doctor-password"
                type="password"
                label="Login password *"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPassword(e.target.value)
                }
                className="w-full min-w-0"
              />
              <IconInput
                icon="written-page"
                name="new-doctor-specialty"
                label="Specialty"
                value={newSpecialty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewSpecialty(e.target.value)
                }
                className="w-full min-w-0 md:col-span-2 xl:col-span-1"
              />
            </div>
            <button
              type="button"
              disabled={adding || !canAddDoctor}
              onClick={() => void addDoctor()}
              className="mt-4 rounded-full border border-neutral-300 px-4 py-2 text-base font-bold text-neutral-800 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-[#333] dark:text-white dark:hover:bg-[#1c1c1c]"
            >
              {adding ? "Adding…" : "+ Add doctor"}
            </button>
          </>
        )}
      </div>

      {error ? (
        <p className="mt-4 text-base font-semibold text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 text-base font-semibold text-green-600 dark:text-green-400">
          {message}
        </p>
      ) : null}

      <div className="mt-6 flex justify-start">
        <Button
          className="center !w-full !py-3.5 !text-lg !font-bold sm:!w-auto sm:min-w-[240px]"
          typeBtn="submit"
          disabled={saving}
        >
          {saving ? (
            <div className="size-5">
              <Icon
                name="spinning-loader"
                className="fill-white dark:fill-black"
              />
            </div>
          ) : (
            "Save clinic details"
          )}
        </Button>
      </div>
    </form>
  )
}

function DoctorAccountForm({
  membership,
  userId,
}: {
  membership: Membership
  userId: string
}) {
  const locationId = membership.practice.locations[0]?.id
  const provider =
    membership.practice.members.find((m) => m.userId === userId)?.user ??
    membership.practice.members[0]?.user

  const [schedules, setSchedules] = useState<
    Array<{
      dayOfWeek: number
      mode: string
      startTime?: string | null
      endTime?: string | null
      sessionStart?: string | null
      sessionEnd?: string | null
      slotIntervalMin?: number | null
      maxPerSlot?: number
      breakStartTime?: string | null
      breakEndTime?: string | null
    }>
  >([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState(provider?.name ?? "")
  const [licenseNo, setLicenseNo] = useState(provider?.doctor?.licenseNo ?? "")
  const [email] = useState(provider?.email ?? "")
  const [consultationFee, setConsultationFee] = useState(
    membership.practice.consultationFee != null
      ? String(membership.practice.consultationFee)
      : "",
  )
  const [bookingType, setBookingType] = useState<"TIME" | "TOKEN">("TIME")
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("17:00")
  const [breakStartTime, setBreakStartTime] = useState("13:00")
  const [breakEndTime, setBreakEndTime] = useState("14:00")
  const [slotDurationMins, setSlotDurationMins] = useState("15")
  const [patientsPerSlot, setPatientsPerSlot] = useState("1")
  const [appointmentValidityDays, setAppointmentValidityDays] = useState(
    String(provider?.doctor?.appointmentValidityDays ?? 7),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [modeConfirm, setModeConfirm] = useState<"TIME" | "TOKEN" | null>(null)
  const [pendingModeChange, setPendingModeChange] = useState<{
    toMode: string
    effectiveDate: string
  } | null>(null)

  const activeMode: "TIME" | "TOKEN" =
    schedules[0]?.mode === "TOKEN_BASED" ? "TOKEN" : "TIME"

  useEffect(() => {
    if (!locationId) {
      setLoading(false)
      return
    }
    void proctoService
      .getSchedules(membership.practice.id, userId)
      .then((res) => {
        if (res.status === "successful") {
          const data = res.data as
            | unknown[]
            | {
                schedules?: typeof schedules
                pendingModeChange?: {
                  toMode: string
                  effectiveDate: string
                } | null
              }
          if (Array.isArray(data)) {
            setSchedules(data as typeof schedules)
            setPendingModeChange(null)
          } else if (data && Array.isArray(data.schedules)) {
            setSchedules(data.schedules)
            setPendingModeChange(data.pendingModeChange ?? null)
          }
        }
        setLoading(false)
      })
  }, [membership.practice.id, userId, locationId])

  useEffect(() => {
    setName(provider?.name ?? "")
    setLicenseNo(provider?.doctor?.licenseNo ?? "")
    setAppointmentValidityDays(
      String(provider?.doctor?.appointmentValidityDays ?? 7),
    )
    setConsultationFee(
      membership.practice.consultationFee != null
        ? String(membership.practice.consultationFee)
        : "",
    )
  }, [provider, membership.practice.consultationFee])

  useEffect(() => {
    if (!schedules.length) return
    const first = schedules[0]
    setBookingType(first.mode === "TOKEN_BASED" ? "TOKEN" : "TIME")
    setWorkingDays([...new Set(schedules.map((s) => s.dayOfWeek))].sort())
    setStartTime(first.startTime || first.sessionStart || "09:00")
    setEndTime(first.endTime || first.sessionEnd || "17:00")
    setBreakStartTime(first.breakStartTime || "")
    setBreakEndTime(first.breakEndTime || "")
    setSlotDurationMins(String(first.slotIntervalMin || 15))
    setPatientsPerSlot(String(first.maxPerSlot || 1))
  }, [schedules])

  function toggleDay(day: number) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  /** Settings only — always confirm; registration stays a free pick. */
  function requestBookingType(next: "TIME" | "TOKEN") {
    if (loading) return
    if (next === bookingType) return
    setError("")
    setModeConfirm(next)
  }

  async function save(
    e?: React.FormEvent,
    opts?: { bookingTypeOverride?: "TIME" | "TOKEN"; modeOnly?: boolean },
  ) {
    e?.preventDefault()
    setError("")
    setMessage("")
    if (!locationId) {
      setError("Practice location missing.")
      return false
    }
    if (!opts?.modeOnly && (!name.trim() || !licenseNo.trim())) {
      setError("Fill Dr Name and license number.")
      return false
    }
    if (opts?.modeOnly && !name.trim() && !provider?.name) {
      setError("Dr Name is required.")
      return false
    }
    const feeNum = Number(consultationFee)
    if (!opts?.modeOnly) {
      if (!Number.isFinite(feeNum) || feeNum <= 0) {
        setError(
          "Appointment / consultation fee (₹) is required and must be greater than 0.",
        )
        return false
      }
    }
    if (workingDays.length === 0) {
      setError("Select at least one working day.")
      return false
    }
    if (!startTime || !endTime || startTime >= endTime) {
      setError("Working end time must be after start time.")
      return false
    }
    setSaving(true)
    const nextType = opts?.bookingTypeOverride ?? bookingType

    // Fee update is clinic-admin only — skip on mode switch so staff doctors can confirm.
    if (!opts?.modeOnly && Number.isFinite(feeNum) && feeNum > 0) {
      const profileRes = await proctoService.updatePracticeProfile(
        membership.practice.id,
        { consultationFee: feeNum },
      )
      if (profileRes.status !== "successful") {
        // Solo owners update fee; clinic staff doctors may lack admin — continue schedule save.
        const msg = String(profileRes.message || "")
        if (!/not authorized|permission|403|admin/i.test(msg)) {
          setSaving(false)
          setError(profileRes.message || "Could not update appointment fee.")
          return false
        }
      }
    }

    const res = await proctoService.saveProviderSettings(
      membership.practice.id,
      {
        providerId: userId,
        locationId,
        name: name.trim() || provider?.name || undefined,
        licenseNo:
          licenseNo.trim() || provider?.doctor?.licenseNo || undefined,
        bookingType: nextType,
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
      },
    )
    setSaving(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not save doctor details.")
      return false
    }
    if (opts?.bookingTypeOverride) setBookingType(opts.bookingTypeOverride)
    const payload = res.data as {
      message?: string
      modeChangeDeferred?: boolean
    } | null
    setMessage(
      payload?.message ||
        (payload?.modeChangeDeferred
          ? "Booking type switch confirmed — it takes effect tomorrow."
          : "Doctor details saved."),
    )
    // Refresh schedules so pending banner appears.
    const schedRes = await proctoService.getSchedules(
      membership.practice.id,
      userId,
    )
    if (schedRes.status === "successful") {
      const data = schedRes.data as
        | unknown[]
        | {
            schedules?: typeof schedules
            pendingModeChange?: {
              toMode: string
              effectiveDate: string
            } | null
          }
      if (Array.isArray(data)) {
        setSchedules(data as typeof schedules)
        setPendingModeChange(null)
      } else if (data && Array.isArray(data.schedules)) {
        setSchedules(data.schedules)
        setPendingModeChange(data.pendingModeChange ?? null)
      }
    }
    return true
  }

  async function confirmModeChange() {
    if (!modeConfirm) return
    const ok = await save(undefined, {
      bookingTypeOverride: modeConfirm,
      modeOnly: true,
    })
    if (ok) setModeConfirm(null)
  }

  if (loading) {
    return <p className="text-base font-medium opacity-80">Loading doctor details…</p>
  }

  const modeLabel = (id: "TIME" | "TOKEN") =>
    id === "TOKEN" ? "Token queue" : "Time slots"

  return (
    <form className="text-left" onSubmit={(e) => void save(e)}>
      <BookingModeChangeModal
        open={modeConfirm != null}
        fromLabel={modeLabel(activeMode)}
        toLabel={modeLabel(modeConfirm ?? activeMode)}
        confirming={saving}
        error={modeConfirm ? error : ""}
        onCancel={() => {
          setModeConfirm(null)
          setError("")
        }}
        onConfirm={() => void confirmModeChange()}
      />
      <p className={sectionLabel}>Doctor profile</p>
      <div className="grid gap-3 sm:grid-cols-2">
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
          onChange={() => {}}
          disabled
        />
        <IconInput
          icon="written-page"
          name="consultationFee"
          label="Appointment fee (₹) *"
          type="number"
          value={consultationFee}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setConsultationFee(e.target.value)
          }
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Shown when patients text *FAQ* or ask about fees on WhatsApp.
      </p>

      <p className={`${sectionLabel} mt-5`}>Booking type</p>
      <p className="mb-2 text-xs opacity-60">
        Change in Settings here (not registration). Confirm to apply from
        tomorrow.
      </p>
      {pendingModeChange ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Switching to{" "}
          <strong>
            {pendingModeChange.toMode === "TOKEN_BASED"
              ? "Token queue"
              : "Time slots"}
          </strong>{" "}
          on <strong>{pendingModeChange.effectiveDate}</strong>.
        </p>
      ) : null}
      <div
        className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-1.5 dark:border-[#333] dark:bg-[#141414]"
        role="radiogroup"
        aria-label="Booking type"
      >
        {(
          [
            ["TIME", "Time slots"],
            ["TOKEN", "Token queue"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={bookingType === id}
            disabled={loading || saving}
            onClick={() => requestBookingType(id)}
            className={`rounded-xl px-4 py-3 text-base font-bold transition disabled:opacity-50 ${
              bookingType === id
                ? "bg-white text-neutral-900 shadow-sm ring-1 ring-[var(--theme-primary)] dark:bg-[#1c1c1c] dark:text-white"
                : "text-neutral-500 hover:bg-white/70 dark:text-[#999] dark:hover:bg-[#1c1c1c]/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className={`${sectionLabel} mt-5`}>Working days</p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => {
          const active = workingDays.includes(day.value)
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`min-w-[3rem] rounded-full px-3 py-2 text-base font-bold transition ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "border border-neutral-200 text-neutral-500 dark:border-[#333]"
              }`}
            >
              {day.label}
            </button>
          )
        })}
      </div>

      <p className={`${sectionLabel} mt-5`}>Working time</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">Start *</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">End *</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
      </div>

      <p className={`${sectionLabel} mt-5`}>Break time (interval)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">Break start</span>
          <input
            type="time"
            value={breakStartTime}
            onChange={(e) => setBreakStartTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">Break end</span>
          <input
            type="time"
            value={breakEndTime}
            onChange={(e) => setBreakEndTime(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
      </div>

      <p className={`${sectionLabel} mt-5`}>Slot settings</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">
            Per slot duration (mins) *
          </span>
          <input
            type="number"
            min={5}
            max={120}
            value={slotDurationMins}
            onChange={(e) => setSlotDurationMins(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
        <label className="block text-base font-semibold">
          <span className="gg-muted text-sm font-bold">
            No. of patients in slots *
          </span>
          <input
            type="number"
            min={1}
            max={50}
            value={patientsPerSlot}
            onChange={(e) => setPatientsPerSlot(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
        </label>
        <label className="block text-base font-semibold sm:col-span-2">
          <span className="gg-muted text-sm font-bold">
            Appointment validity (days) *
          </span>
          <input
            type="number"
            min={1}
            max={90}
            value={appointmentValidityDays}
            onChange={(e) => setAppointmentValidityDays(e.target.value)}
            className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
          />
          <span className="gg-faint mt-1 block text-sm font-medium">
            How far ahead patients can book (1–90 days). Default 7.
          </span>
        </label>
      </div>

      {error ? (
        <p className="mt-4 text-base font-semibold text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-4 text-base font-semibold text-green-600 dark:text-green-400">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex justify-center">
        <Button
          className="center !w-full !py-3.5 !text-lg !font-bold sm:!w-auto sm:min-w-[220px]"
          typeBtn="submit"
          disabled={saving}
        >
          {saving ? (
            <div className="size-5">
              <Icon
                name="spinning-loader"
                className="fill-white dark:fill-black"
              />
            </div>
          ) : (
            "Save doctor details"
          )}
        </Button>
      </div>
    </form>
  )
}
