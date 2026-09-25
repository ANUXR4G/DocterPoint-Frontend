"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { DoctorAnalytics } from "@/components"
import DoctorQueue from "@/components/ui/doctors/pages/DoctorQueue"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import {
  CLINIC_SUBSCRIPTION_HREF,
  practiceTabHref,
} from "@/lib/doctorPracticeTabs"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { matchesQueueStatusFilter } from "@/lib/bookingStatus"
import { practiceTodayIso } from "@/lib/practiceTime"
import {
  filterBookingsByDate,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--theme-primary)] dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-slate-500"

function OnboardBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get("onboarded") !== "1") return null

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/40">
      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        Clinic account created — finish billing and WhatsApp setup when ready.
      </p>
      <Link
        href="/clinic/subscription?onboarded=1"
        className="mt-2 inline-flex text-sm font-semibold text-[var(--theme-primary)] hover:underline"
      >
        Open subscription &amp; setup →
      </Link>
    </div>
  )
}

type DoctorSnap = {
  id: string
  name: string
  waiting: number
  inAppointment: number
  booked: number
  completed: number
}

const OPS_LINKS = [
  {
    href: practiceTabHref("setup"),
    title: "Hours & blocks",
    body: "Override any doctor’s hours, slots, and leave",
  },
  {
    href: "/clinic/doctors",
    title: "Doctors overview",
    body: "Override settings, queue status, analytics",
  },
  {
    href: "/doctor/patients",
    title: "Patients",
    body: "Visit history and status edits",
  },
  {
    href: "/clinic/analytics",
    title: "Analytics",
    body: "All doctors, then analyze one by one",
  },
  {
    href: "/clinic/queue",
    title: "Full queue",
    body: "Change patient status for every doctor",
  },
  {
    href: "/clinic/subscription",
    title: "Subscription",
    body: "Plans, trial, WhatsApp line",
  },
] as const

function ClinicOpsHub() {
  const { memberships, bookings: allBookings } = usePracticeDashboard()
  const [canManage, setCanManage] = useState(false)
  const [doctors, setDoctors] = useState<DoctorSnap[]>([])
  const [doctorCount, setDoctorCount] = useState(0)
  const [totals, setTotals] = useState({
    waiting: 0,
    inAppointment: 0,
    booked: 0,
    completed: 0,
  })
  const [multiDoctorAllowed, setMultiDoctorAllowed] = useState(true)
  const [entitlementHint, setEntitlementHint] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")
  const [formMessage, setFormMessage] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [licenseNo, setLicenseNo] = useState("")

  const practiceId = memberships[0]?.practice?.id ?? null

  const loadRoster = useCallback(async () => {
    if (!memberships.length) {
      setDoctors([])
      setCanManage(false)
      setDoctorCount(0)
      return
    }
    const membership = memberships[0]
    const practice = membership?.practice
    if (!practice?.id) return

    setCanManage(
      membership.role === "PRACTICE_OWNER" ||
        membership.role === "PRACTICE_ADMIN",
    )

    const date = practiceTodayIso()
    const bookings = filterBookingsByDate(allBookings, date) as Array<
      ProctoBooking & {
        providerId?: string
        provider?: { id?: string; name?: string | null; email?: string | null }
      }
    >

    const map = new Map<string, DoctorSnap>()
    const members = (practice.members ?? []).filter(
      (m) =>
        m.isActive !== false &&
        ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"].includes(m.role),
    )
    setDoctorCount(members.length)
    for (const m of members) {
      map.set(m.userId, {
        id: m.userId,
        name: m.user?.name || m.user?.email || "Doctor",
        waiting: 0,
        inAppointment: 0,
        booked: 0,
        completed: 0,
      })
    }

    let waiting = 0
    let inAppointment = 0
    let booked = 0
    let completed = 0
    for (const b of bookings) {
      const id = b.provider?.id || b.providerId || "unknown"
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: b.provider?.name || b.provider?.email || "Doctor",
          waiting: 0,
          inAppointment: 0,
          booked: 0,
          completed: 0,
        })
      }
      const row = map.get(id)!
      if (matchesQueueStatusFilter(b.status, "waiting")) {
        row.waiting += 1
        waiting += 1
      } else if (matchesQueueStatusFilter(b.status, "in_appointment")) {
        row.inAppointment += 1
        inAppointment += 1
      } else if (
        matchesQueueStatusFilter(b.status, "booked") ||
        matchesQueueStatusFilter(b.status, "accepted")
      ) {
        row.booked += 1
        booked += 1
      } else if (String(b.status).toUpperCase() === "COMPLETED") {
        row.completed += 1
        completed += 1
      }
    }

    setDoctors([...map.values()].sort((a, b) => a.name.localeCompare(b.name)))
    setTotals({ waiting, inAppointment, booked, completed })

    const billing = await proctoService.getPracticeBilling(practice.id)
    if (billing.status === "successful" && billing.data) {
      const ent = (
        billing.data as {
          entitlement?: {
            usable?: boolean
            features?: Record<string, unknown>
          }
        }
      ).entitlement
      const multi =
        ent?.features?.multiDoctor === true ||
        ent?.features?.multiDoctor === 1
      const doctorSeats = members.filter((m) => m.role === "DOCTOR").length
      const canAddMore = Boolean(ent?.usable) && (multi || doctorSeats < 1)
      setMultiDoctorAllowed(canAddMore)
      if (!ent?.usable) {
        setEntitlementHint(
          "Active subscription required to add doctors. Open Subscription to subscribe.",
        )
      } else if (doctorSeats >= 1 && !multi) {
        setEntitlementHint(
          "Multi-doctor clinics require Growth or Clinic. Upgrade under Subscription.",
        )
      } else {
        setEntitlementHint("")
      }
    }
  }, [memberships, allBookings])

  useEffect(() => {
    if (!memberships.length) return
    void loadRoster()
  }, [loadRoster, memberships.length])

  useEffect(() => {
    function openFromHash() {
      if (typeof window === "undefined") return
      if (window.location.hash === "#add-doctor" && canManage) {
        setShowAddForm(true)
      }
    }
    openFromHash()
    window.addEventListener("hashchange", openFromHash)
    return () => window.removeEventListener("hashchange", openFromHash)
  }, [canManage])

  async function addDoctor() {
    if (!practiceId) return
    setFormError("")
    setFormMessage("")
    if (!name.trim() || !email.trim() || !password.trim()) {
      setFormError("Name, email, and password are required.")
      return
    }
    if (password.trim().length < 6) {
      setFormError("Password must be at least 6 characters.")
      return
    }
    setBusy(true)
    const res = await proctoService.addPracticeDoctor(practiceId, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      specialty: specialty.trim() || undefined,
      licenseNo: licenseNo.trim() || undefined,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setFormError(res.message || "Could not add doctor.")
      return
    }
    setFormMessage("Doctor added. They can sign in with this email and password.")
    setName("")
    setEmail("")
    setPassword("")
    setPhone("")
    setSpecialty("")
    setLicenseNo("")
    await loadRoster()
  }

  const chips = useMemo(
    () => [
      { label: "In waiting", value: totals.waiting, tone: "violet" },
      { label: "Appointment started", value: totals.inAppointment, tone: "amber" },
      { label: "Booked", value: totals.booked, tone: "sky" },
      { label: "Appointment finished", value: totals.completed, tone: "green" },
    ],
    [totals],
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {chips.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-[var(--solune-surface)]"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OPS_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-[var(--theme-primary)] dark:border-white/10 dark:bg-[var(--solune-surface)] dark:hover:border-blue-500/40"
          >
            <p className="font-semibold text-slate-900 dark:text-white">
              {l.title}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{l.body}</p>
          </Link>
        ))}
      </div>

      <div
        id="add-doctor"
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[var(--solune-surface)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Doctors today
              <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                ({doctorCount})
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Waiting room and visit counts by doctor
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm((v) => !v)
                setFormError("")
                setFormMessage("")
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--theme-primary)] px-3 text-sm font-semibold text-white"
            >
              {showAddForm ? "Hide form" : "Add doctor"}
            </button>
          ) : null}
        </div>

        {doctors.length > 0 ? (
          <ul className="divide-y divide-slate-200/80 dark:divide-white/10">
            {doctors.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">{d.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Waiting {d.waiting} · In appt {d.inAppointment} · Booked{" "}
                    {d.booked} · Done {d.completed}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/clinic/analytics?doctor=${encodeURIComponent(d.id)}`}
                    className="text-xs font-semibold text-blue-600 hover:underline dark:text-sky-400"
                  >
                    Analyze
                  </Link>
                  <Link
                    href={`/clinic/queue?doctor=${encodeURIComponent(d.id)}`}
                    className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                  >
                    Queue
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
            No doctors on the roster yet. Add one below to open the clinic queue.
          </p>
        )}

        {canManage && showAddForm ? (
          <div className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Add a doctor to this clinic</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              They sign in at{" "}
              <strong>Doctor Login</strong> with the email and password you set.
              They manage their own queue, schedule, and visits; the clinic
              still manages the roster (add / deactivate). Independently
              registered doctors cannot be linked.
            </p>

            {!multiDoctorAllowed ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  {entitlementHint ||
                    "Upgrade to Growth or Clinic for multi-doctor."}
                </p>
                <Link
                  href={CLINIC_SUBSCRIPTION_HREF}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white"
                >
                  Open Subscription
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Doctor name *"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                />
                <input
                  placeholder="Login email *"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                />
                <input
                  placeholder="Login password *"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={fieldClass}
                />
                <input
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldClass}
                />
                <input
                  placeholder="Specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className={fieldClass}
                />
                <input
                  placeholder="License no"
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  className={fieldClass}
                />
                <div className="sm:col-span-2">
                  {(formError || formMessage) && (
                    <p
                      className={`mb-3 text-sm ${
                        formError
                          ? "text-red-600 dark:text-red-300"
                          : "text-green-700 dark:text-green-400"
                      }`}
                    >
                      {formError || formMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void addDoctor()}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Add doctor"}
                    </button>
                    <Link
                      href={practiceTabHref("doctors")}
                      className="inline-flex h-11 items-center text-sm font-semibold text-[var(--theme-primary)] hover:underline"
                    >
                      Full roster →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function ClinicDashboard() {
  const { liveConnected } = usePracticeDashboard()

  return (
    <div className="dashboard-page-wide">
      <Suspense fallback={null}>
        <OnboardBanner />
      </Suspense>

      <DashboardPageHeader
        eyebrow="Clinic portal"
        title="Your practice today"
        subtitle="Waiting room, full doctors overview, per-doctor analytics, Hours & blocks — clinic operations in one place."
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
                  ? "Live updates connected"
                  : "Connecting live updates…"
              }
            >
              {liveConnected ? "Live" : "Connecting…"}
            </span>
            <a href="#add-doctor" className="dashboard-btn-primary">
              Add doctor
            </a>
            <Link href={CLINIC_SUBSCRIPTION_HREF} className="dashboard-btn-secondary">
              Subscription
            </Link>
          </>
        }
      />

      <ClinicOpsHub />

      <DoctorAnalytics />

      <section className="space-y-4">
        <div className="flex h-12 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="dashboard-section-title">Today&apos;s queue</h2>
            <p className="dashboard-section-sub">
              Arrived → In waiting → Appointment started → Appointment finished
            </p>
          </div>
          <Link href="/clinic/queue" className="dashboard-link">
            Full-screen queue →
          </Link>
        </div>

        <div className="dashboard-section overflow-hidden">
          <div className="max-h-[min(65vh,640px)] min-h-[20rem] overflow-auto p-2 sm:p-3">
            <Suspense
              fallback={
                <p className="p-4 text-sm text-neutral-500">Loading queue…</p>
              }
            >
              <DoctorQueue showFilters allowStatusControl />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  )
}
