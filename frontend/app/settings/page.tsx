"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button, Icon, IconInput, ThemeUI } from "@/components"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { PracticeManagementPanel } from "@/components/ui/doctors/pages/PracticeManagementPanel"
import BookingModeChangeModal from "@/components/ui/procto/BookingModeChangeModal"
import ProfilePhotoField from "@/components/ui/procto/ProfilePhotoField"
import RazorpayAccountPanel from "@/components/ui/procto/RazorpayAccountPanel"
import {
  EffectiveFromField,
  NoticePeriodSelect,
  PendingVerificationPanel,
  ScheduleConflictModal,
  UpcomingScheduleChanges,
  addDaysIso,
  clinicTodayIso,
  discardedMessage,
  formatScheduleDay,
  normalizePendingVerification,
  normalizeUpcomingChanges,
} from "@/components/ui/procto/ScheduleChangeControls"
import { PracticeDashboardProvider } from "@/contexts/PracticeDashboardContext"
import { queryClient } from "@/app/providers"
import { useRole } from "@/hooks/useRole"
import { CLINIC_SUBSCRIPTION_HREF, practiceTabHref } from "@/lib/doctorPracticeTabs"
import {
  proctoService,
  type PendingScheduleVerification,
  type SchedulePreview,
  type UpcomingScheduleChange,
} from "@/lib/services/procto"

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

/** WhatsApp line states in which the backend locks the clinic Tel to the line number. */
const LOCKED_LINE_STATUSES = new Set([
  "LIVE",
  "TEMPLATES_PENDING",
  "DISPLAY_NAME_PENDING",
  "VERIFYING",
  "ASSIGNED",
])

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
      : "Practice profile, fees, hours and appearance."
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
    <div className="w-full space-y-6 pb-8 sm:space-y-7">
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
        <div className="dashboard-panel mt-5 w-full">
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
        <div className="dashboard-panel mt-5 w-full">
          <div className="mb-4">
            <h2 className="dashboard-section-title text-lg">Practice</h2>
            <p className="dashboard-section-sub">
              Schedule, hours, doctors, WhatsApp inbox, and clinical masters.
            </p>
          </div>
          <PracticeDashboardProvider>
            <PracticeManagementPanel embedded />
          </PracticeDashboardProvider>
        </div>
      ) : (
        <div className="dashboard-panel mt-5 w-full">
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
    specialty?: string | null
    registrationNo?: string | null
    phone?: string | null
    email?: string | null
    consultationFee?: number | null
    advanceBookingAmount?: number | null
    scheduleNoticeHours?: number | null
    whatsappBusinessNumber?: string | null
    bgSrc?: string | null
    locations: { id: string; name: string; address: string; city: string }[]
    members: Array<{
      userId: string
      role: string
      user: {
        id: string
        name: string | null
        email?: string | null
        imgSrc?: string | null
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

  const canManagePayments =
    membership.role === "PRACTICE_OWNER" ||
    membership.role === "PRACTICE_ADMIN" ||
    (membership.practice.type === "SOLO" && membership.practice.members.length <= 1)

  return (
    <>
      {showClinicForm ? (
        <ClinicAccountForm membership={membership} onReload={reload} />
      ) : (
        <DoctorAccountForm
          membership={membership}
          userId={membership.userId}
          onReload={reload}
        />
      )}
      {canManagePayments ? (
        <RazorpayAccountPanel practiceId={membership.practice.id} />
      ) : null}
    </>
  )
}

function PhotoSettings({
  membership,
  userId,
  showLogo,
  onReload,
}: {
  membership: Membership
  userId: string
  showLogo: boolean
  onReload: () => Promise<void>
}) {
  const me = membership.practice.members.find((m) => m.userId === userId)?.user
  const isSolo = membership.practice.type === "SOLO"

  async function refresh() {
    proctoService.invalidateMyPracticesCache()
    await onReload()
  }

  return (
    <div className="mb-6 w-full">
      <p className={sectionLabel}>Photos</p>
      <div className="grid w-full gap-5 sm:grid-cols-2">
        <ProfilePhotoField
          label="Your photo"
          hint="Shown to patients on your profile and booking pages."
          src={me?.imgSrc}
          name={me?.name}
          onSave={async (url) => {
            const res = await proctoService.updateMyPhoto(url)
            if (res.status !== "successful") {
              return { ok: false, message: res.message }
            }
            void queryClient.invalidateQueries("user:info")
            await refresh()
            return { ok: true }
          }}
        />
        {showLogo ? (
          <ProfilePhotoField
            label="Clinic logo"
            hint={
              isSolo
                ? "Shown on your clinic card when you have no photo."
                : "Shown on your clinic card and profile page."
            }
            src={membership.practice.bgSrc}
            name={membership.practice.name}
            shape="square"
            onSave={async (url) => {
              const res = await proctoService.updatePracticeProfile(
                membership.practice.id,
                { bgSrc: url },
              )
              if (res.status !== "successful") {
                return { ok: false, message: res.message }
              }
              await refresh()
              return { ok: true }
            }}
          />
        ) : null}
      </div>
    </div>
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
  const [advanceAmount, setAdvanceAmount] = useState(
    membership.practice.advanceBookingAmount != null
      ? String(membership.practice.advanceBookingAmount)
      : "",
  )
  const [noticeHours, setNoticeHours] = useState(
    String(membership.practice.scheduleNoticeHours ?? 48),
  )
  const [city, setCity] = useState(loc?.city ?? "")
  const [specialty, setSpecialty] = useState(membership.practice.specialty ?? "")
  const [waBotPhone, setWaBotPhone] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const roster = membership.practice.members.filter(
    (m) =>
      m.role === "DOCTOR" ||
      ((m.role === "PRACTICE_OWNER" || m.role === "PRACTICE_ADMIN") &&
        m.user.doctor),
  )

  useEffect(() => {
    setClinicName(membership.practice.name)
    setAddress(membership.practice.locations[0]?.address ?? "")
    setCity(membership.practice.locations[0]?.city ?? "")
    setSpecialty(membership.practice.specialty ?? "")
    setRegistrationNo(membership.practice.registrationNo ?? "")
    setTelNo(membership.practice.phone || "")
    setEmail(membership.practice.email ?? "")
    setConsultationFee(
      membership.practice.consultationFee != null
        ? String(membership.practice.consultationFee)
        : "",
    )
    setAdvanceAmount(
      membership.practice.advanceBookingAmount != null
        ? String(membership.practice.advanceBookingAmount)
        : "",
    )
    setNoticeHours(String(membership.practice.scheduleNoticeHours ?? 48))
  }, [membership])

  useEffect(() => {
    let cancelled = false
    void proctoService.getPracticeBilling(membership.practice.id).then((res) => {
      if (cancelled || res?.status !== "successful" || !res.data) return
      const line = (
        res.data as {
          practice?: {
            whatsappNumber?: { phoneNumber?: string; status?: string } | null
          }
        }
      ).practice?.whatsappNumber
      const bot =
        line?.status && LOCKED_LINE_STATUSES.has(line.status)
          ? line.phoneNumber?.replace(/\D/g, "").slice(-10) || null
          : null
      setWaBotPhone(bot)
      if (bot) setTelNo(bot)
    })
    return () => {
      cancelled = true
    }
  }, [membership.practice.id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (
      !clinicName.trim() ||
      !address.trim() ||
      !city.trim() ||
      !registrationNo.trim() ||
      !(waBotPhone || telNo).trim() ||
      !email.trim()
    ) {
      setError("Fill Clinic name, Reg no, Address, City, Tel and Email.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid clinic email.")
      return
    }
    if (!waBotPhone && telNo.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit clinic phone number.")
      return
    }
    const feeNum = Number(consultationFee)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setError("Appointment / consultation fee (₹) is required and must be greater than 0.")
      return
    }
    const advanceNum = advanceAmount.trim() ? Number(advanceAmount) : null
    if (advanceNum != null && (!Number.isFinite(advanceNum) || advanceNum < 1)) {
      setError("Advance booking amount must be at least ₹1 (or leave it empty).")
      return
    }
    setSaving(true)
    const phoneToSave =
      (waBotPhone || telNo).replace(/\D/g, "").slice(-10) || telNo.trim()
    const res = await proctoService.updatePracticeProfile(
      membership.practice.id,
      {
        name: clinicName.trim(),
        specialty: specialty.trim(),
        registrationNo: registrationNo.trim(),
        phone: phoneToSave,
        email: email.trim(),
        consultationFee: feeNum,
        advanceBookingAmount: advanceNum,
        scheduleNoticeHours: Number(noticeHours),
        location: {
          id: loc?.id,
          address: address.trim(),
          city: city.trim(),
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

  return (
    <form noValidate className="w-full text-left" onSubmit={(e) => void save(e)}>
      <PhotoSettings
        membership={membership}
        userId={membership.userId}
        showLogo
        onReload={onReload}
      />
      <p className={sectionLabel}>Clinic details</p>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <IconInput
          icon="home"
          name="clinicName"
          label="Clinic name *"
          value={clinicName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setClinicName(e.target.value)
          }
          className="w-full min-w-0"
        />
        <IconInput
          icon="written-page"
          name="registrationNo"
          label="Registration no *"
          value={registrationNo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRegistrationNo(e.target.value)
          }
          className="w-full min-w-0"
        />
        <div className="sm:col-span-2">
          <IconInput
            icon="doctor"
            name="specialty"
            label="Specialty (shown in Find clinics)"
            value={specialty}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSpecialty(e.target.value)
            }
            className="w-full min-w-0"
          />
        </div>
      </div>

      <p className={`${sectionLabel} mt-6`}>Location & contact</p>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <IconInput
          icon="pin"
          name="address"
          label="Street address *"
          value={address}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setAddress(e.target.value)
          }
          className="w-full min-w-0"
        />
        <IconInput
          icon="pin"
          name="city"
          label="City / area *"
          value={city}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setCity(e.target.value)
          }
          className="w-full min-w-0"
        />
        <div className="min-w-0">
          <IconInput
            icon="phone"
            name="telNo"
            type="tel"
            label={waBotPhone ? "Tel * (WhatsApp booking number)" : "Tel *"}
            value={waBotPhone || telNo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (waBotPhone) return
              setTelNo(e.target.value)
            }}
            className="w-full min-w-0"
            disabled={Boolean(waBotPhone)}
            readOnly={Boolean(waBotPhone)}
          />
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {waBotPhone
              ? "Locked to your live WhatsApp booking line — patients message this number. "
              : "Once your WhatsApp booking line is live, Tel switches to that number. "}
            <Link
              href={CLINIC_SUBSCRIPTION_HREF}
              className="font-semibold underline"
            >
              Subscription → WhatsApp line
            </Link>
          </p>
        </div>
        <IconInput
          icon="envelope"
          name="email"
          type="email"
          label="Email *"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEmail(e.target.value)
          }
          className="w-full min-w-0"
        />
      </div>

      <p className={`${sectionLabel} mt-6`}>Fees & booking rules</p>
      <div className="grid w-full gap-3 sm:grid-cols-2">
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
        <IconInput
          icon="written-page"
          name="advanceBookingAmount"
          label="Advance booking amount (₹, optional)"
          type="number"
          value={advanceAmount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setAdvanceAmount(e.target.value)
          }
          className="w-full min-w-0"
        />
        <div className="sm:col-span-2">
          <NoticePeriodSelect value={noticeHours} onChange={setNoticeHours} disabled={saving} />
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Fee is shown when patients text *FAQ* or ask about fees on WhatsApp.
        After a WhatsApp booking the bot offers to collect the advance booking
        amount online (Razorpay) — or the full fee when the advance is empty.
      </p>

      <div className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-[#262626]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`${sectionLabel} !mb-0`}>Doctors</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {roster.length
                ? `${roster.length} doctor${roster.length === 1 ? "" : "s"} on this clinic.`
                : "No doctors on this clinic yet."}{" "}
              Add, deactivate or change a doctor&apos;s hours from Practice.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={practiceTabHref("doctors")}
              className="inline-flex h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Manage doctors
            </Link>
            <Link
              href={practiceTabHref("setup")}
              className="inline-flex h-10 items-center rounded-full border border-neutral-300 px-4 text-sm font-semibold dark:border-[#333]"
            >
              Hours & blocks
            </Link>
          </div>
        </div>
        {roster.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {roster.map((m) => (
              <li
                key={m.userId}
                className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium dark:bg-[#1c1c1c]"
              >
                {m.user.name || m.user.email || "Doctor"}
              </li>
            ))}
          </ul>
        ) : null}
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

type SaveOpts = {
  bookingTypeOverride?: "TIME" | "TOKEN"
  modeOnly?: boolean
  effectiveFrom?: string
  skipPreview?: boolean
}

function DoctorAccountForm({
  membership,
  userId,
  onReload,
}: {
  membership: Membership
  userId: string
  onReload: () => Promise<void>
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
  const [scheduleLoadError, setScheduleLoadError] = useState("")

  const [name, setName] = useState(provider?.name ?? "")
  const [licenseNo, setLicenseNo] = useState(provider?.doctor?.licenseNo ?? "")
  const [email] = useState(provider?.email ?? "")
  const [consultationFee, setConsultationFee] = useState(
    membership.practice.consultationFee != null
      ? String(membership.practice.consultationFee)
      : "",
  )
  const [advanceAmount, setAdvanceAmount] = useState(
    membership.practice.advanceBookingAmount != null
      ? String(membership.practice.advanceBookingAmount)
      : "",
  )
  const [noticeHours, setNoticeHours] = useState(
    String(membership.practice.scheduleNoticeHours ?? 48),
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
  const [effectiveFrom, setEffectiveFrom] = useState(clinicTodayIso)
  const [upcomingChanges, setUpcomingChanges] = useState<UpcomingScheduleChange[]>([])
  const [cancellingDate, setCancellingDate] = useState<string | null>(null)
  const [pendingVerification, setPendingVerification] =
    useState<PendingScheduleVerification | null>(null)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [resolverSignal, setResolverSignal] = useState(0)
  const [conflictReview, setConflictReview] = useState<{
    preview: SchedulePreview
    opts?: SaveOpts
  } | null>(null)

  const activeMode: "TIME" | "TOKEN" =
    schedules[0]?.mode === "TOKEN_BASED" ? "TOKEN" : "TIME"

  async function refreshSchedules() {
    const res = await proctoService.getSchedules(membership.practice.id, userId)
    if (res.status !== "successful") {
      setScheduleLoadError(
        res.message ||
          "Could not load your working hours. Reload the page before saving.",
      )
      return
    }
    const data = res.data as unknown[] | { schedules?: typeof schedules } | null
    if (Array.isArray(data)) setSchedules(data as typeof schedules)
    else if (data && Array.isArray(data.schedules)) setSchedules(data.schedules)
    setUpcomingChanges(normalizeUpcomingChanges(res.data))
    setPendingVerification(normalizePendingVerification(res.data))
    setScheduleLoadError("")
  }

  async function activatePending(date?: string) {
    setPendingBusy(true)
    setError("")
    const res = await proctoService.activatePendingSchedule(
      membership.practice.id,
      userId,
      date,
    )
    setPendingBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not activate the pending schedule.")
      return
    }
    setMessage(
      (res.data as { message?: string } | null)?.message || "New schedule activated.",
    )
    await refreshSchedules()
  }

  async function discardPending() {
    setPendingBusy(true)
    setError("")
    const res = await proctoService.discardPendingSchedule(membership.practice.id, userId)
    setPendingBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not discard the pending schedule.")
      return
    }
    setMessage(discardedMessage(res.data))
    await refreshSchedules()
  }

  useEffect(() => {
    if (!locationId) {
      setLoading(false)
      return
    }
    void refreshSchedules().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership.practice.id, userId, locationId])

  async function cancelUpcoming(date: string) {
    setCancellingDate(date)
    setError("")
    const res = await proctoService.cancelUpcomingSchedule(
      membership.practice.id,
      userId,
      date,
    )
    setCancellingDate(null)
    if (res.status !== "successful") {
      setError(res.message || "Could not cancel the scheduled change.")
      return
    }
    setMessage(`Scheduled change from ${formatScheduleDay(date)} cancelled.`)
    await refreshSchedules()
  }

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
    setAdvanceAmount(
      membership.practice.advanceBookingAmount != null
        ? String(membership.practice.advanceBookingAmount)
        : "",
    )
    setNoticeHours(String(membership.practice.scheduleNoticeHours ?? 48))
  }, [
    provider,
    membership.practice.consultationFee,
    membership.practice.advanceBookingAmount,
    membership.practice.scheduleNoticeHours,
  ])

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
    opts?: SaveOpts,
  ): Promise<boolean | "conflicts"> {
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
    const advanceNum = advanceAmount.trim() ? Number(advanceAmount) : null
    if (
      !opts?.modeOnly &&
      advanceNum != null &&
      (!Number.isFinite(advanceNum) || advanceNum < 1)
    ) {
      setError("Advance booking amount must be at least ₹1 (or leave it empty).")
      return false
    }
    if (scheduleLoadError) {
      setError(scheduleLoadError)
      return false
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
    const scheduleBody = {
      providerId: userId,
      locationId,
      bookingType: nextType,
      workingDays,
      startTime,
      endTime,
      breakStartTime: breakStartTime || undefined,
      breakEndTime: breakEndTime || undefined,
      slotDurationMins: Number(slotDurationMins) || 15,
      patientsPerSlot: Number(patientsPerSlot) || 1,
      effectiveFrom: opts?.effectiveFrom ?? effectiveFrom,
    }

    if (!opts?.skipPreview) {
      const preview = await proctoService.previewProviderSettings(
        membership.practice.id,
        scheduleBody,
      )
      if (
        preview.status === "successful" &&
        (preview.data?.conflicts.length || preview.data?.notice?.adjusted)
      ) {
        setSaving(false)
        setConflictReview({ preview: preview.data, opts })
        return "conflicts"
      }
    }

    // Fee update is clinic-admin only — skip on mode switch so staff doctors can confirm.
    if (!opts?.modeOnly && Number.isFinite(feeNum) && feeNum > 0) {
      const profileRes = await proctoService.updatePracticeProfile(
        membership.practice.id,
        {
          consultationFee: feeNum,
          advanceBookingAmount: advanceNum,
          scheduleNoticeHours: Number(noticeHours),
        },
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
        ...scheduleBody,
        name: name.trim() || provider?.name || undefined,
        licenseNo:
          licenseNo.trim() || provider?.doctor?.licenseNo || undefined,
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
    setEffectiveFrom(clinicTodayIso())
    await refreshSchedules()
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

  async function resolveConflicts(date?: string) {
    if (!conflictReview) return
    const { opts, preview } = conflictReview
    const chosen = date ?? preview.effectiveFrom
    if (date) setEffectiveFrom(date)
    const ok = await save(undefined, { ...opts, effectiveFrom: chosen, skipPreview: true })
    if (ok) {
      setConflictReview(null)
      if (!date) setResolverSignal((s) => s + 1)
    }
  }

  const modeStartIso =
    effectiveFrom > clinicTodayIso() ? effectiveFrom : addDaysIso(clinicTodayIso(), 1)

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
        effectiveDateLabel={formatScheduleDay(modeStartIso)}
        confirming={saving}
        error={modeConfirm ? error : ""}
        onCancel={() => {
          setModeConfirm(null)
          setError("")
        }}
        onConfirm={() => void confirmModeChange()}
      />
      <ScheduleConflictModal
        preview={conflictReview?.preview ?? null}
        busy={saving}
        onApplyFrom={(date) => void resolveConflicts(date)}
        onSavePending={() => void resolveConflicts()}
        onCancel={() => setConflictReview(null)}
      />
      <PhotoSettings
        membership={membership}
        userId={userId}
        showLogo={
          membership.role === "PRACTICE_OWNER" ||
          membership.role === "PRACTICE_ADMIN" ||
          (membership.practice.type === "SOLO" &&
            membership.practice.members.length <= 1)
        }
        onReload={onReload}
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
        <IconInput
          icon="written-page"
          name="advanceBookingAmount"
          label="Advance booking amount (₹, optional)"
          type="number"
          value={advanceAmount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setAdvanceAmount(e.target.value)
          }
        />
        <NoticePeriodSelect value={noticeHours} onChange={setNoticeHours} disabled={saving} />
      </div>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Fee is shown when patients text *FAQ* or ask about fees on WhatsApp.
        After a WhatsApp booking the bot offers to collect the advance booking
        amount online (Razorpay) — or the full fee when the advance is empty.
      </p>

      <p className={`${sectionLabel} mt-5`}>Booking type</p>
      <p className="mb-2 text-xs opacity-60">
        Change in Settings here (not registration). A switch starts tomorrow at
        the earliest, or on the &ldquo;Changes apply from&rdquo; date below.
      </p>
      {pendingVerification ? (
        <div className="mb-2">
          <PendingVerificationPanel
            pending={pendingVerification}
            busy={pendingBusy}
            onActivate={(date) => void activatePending(date)}
            onDiscard={() => void discardPending()}
            openResolverSignal={resolverSignal}
            resolver={{
              practiceId: membership.practice.id,
              providerId: userId,
              onResolved: (msg) => {
                setMessage(msg)
                void refreshSchedules()
              },
            }}
          />
        </div>
      ) : null}
      {upcomingChanges.length ? (
        <div className="mb-2">
          <UpcomingScheduleChanges
            changes={upcomingChanges}
            cancellingDate={cancellingDate}
            onCancel={(date) => void cancelUpcoming(date)}
          />
        </div>
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

      <p className={`${sectionLabel} mt-5`}>Schedule start</p>
      <EffectiveFromField
        value={effectiveFrom}
        onChange={setEffectiveFrom}
        disabled={saving}
        noticeHours={Number(noticeHours)}
      />

      {error || scheduleLoadError ? (
        <p className="mt-4 text-base font-semibold text-red-600 dark:text-red-300">
          {error || scheduleLoadError}
        </p>
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
          disabled={saving || loading || Boolean(scheduleLoadError)}
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
