"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThinkingLoader } from "@/components"
import OnboardPracticeWizard from "@/components/ui/procto/OnboardPracticeWizard"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { proctoService } from "@/lib/services/procto"
import { cookies } from "@/utils/cookies"
import { providerDashboardFromContext } from "@/lib/providerPortal"

type Member = {
  userId: string
  role: string
  isActive?: boolean
  user: {
    id: string
    name: string | null
    email?: string | null
    phone?: string | null
    doctor?: {
      licenseNo: string | null
      description?: string | null
    } | null
  }
}

type Membership = {
  role: string
  userId: string
  practice: {
    id: string
    name: string
    slug: string
    members: Member[]
  }
}

const fieldClass =
  "w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-[var(--theme-primary)] dark:border-neutral-600"

export default function DoctorsManagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [practiceIdx, setPracticeIdx] = useState(0)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [licenseNo, setLicenseNo] = useState("")
  const [multiDoctorAllowed, setMultiDoctorAllowed] = useState(true)
  const [entitlementHint, setEntitlementHint] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    const res = await proctoService.getMyPractices()
    if (res.status === "successful" && Array.isArray(res.data)) {
      const list = res.data as Membership[]
      // Clinic doctor management is for owners/admins only
      const adminMemberships = list.filter(
        (m) =>
          m.role === "PRACTICE_OWNER" || m.role === "PRACTICE_ADMIN",
      )
      if (list.length > 0 && adminMemberships.length === 0) {
        router.replace(
          providerDashboardFromContext(
            "doctor",
            null,
            cookies.getCookie("gg_portal"),
          ),
        )
        return
      }
      setMemberships(adminMemberships)
      setPracticeIdx(0)
    } else {
      setMemberships([])
      if (res.status !== "successful") {
        setError(res.message || "Could not load practices.")
      }
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const membership = memberships[practiceIdx]
  const practice = membership?.practice
  const canManage =
    membership?.role === "PRACTICE_OWNER" ||
    membership?.role === "PRACTICE_ADMIN"

  const doctors =
    practice?.members.filter(
      (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
    ) ?? []

  useEffect(() => {
    if (!practice?.id) {
      setMultiDoctorAllowed(true)
      setEntitlementHint("")
      return
    }
    let cancelled = false
    void proctoService.getPracticeBilling(practice.id).then((res) => {
      if (cancelled) return
      if (res?.status !== "successful" || !res.data) return
      const ent = (res.data as { entitlement?: { usable?: boolean; features?: Record<string, unknown> } })
        .entitlement
      const canAddMore =
        Boolean(ent?.usable) &&
        (ent?.features?.multiDoctor === true ||
          ent?.features?.multiDoctor === 1 ||
          doctors.length < 1)
      setMultiDoctorAllowed(canAddMore)
      if (!ent?.usable) {
        setEntitlementHint(
          "Active subscription required to add doctors. Open Subscription to subscribe.",
        )
      } else if (
        doctors.length >= 1 &&
        !(ent.features?.multiDoctor === true || ent.features?.multiDoctor === 1)
      ) {
        setEntitlementHint(
          "Multi-doctor clinics require Growth or Clinic. Upgrade under Subscription.",
        )
      } else {
        setEntitlementHint("")
      }
    })
    return () => {
      cancelled = true
    }
  }, [practice?.id, doctors.length])

  async function addDoctor() {
    if (!practice) return
    setError("")
    setMessage("")
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required for doctor login.")
      return
    }
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    setBusy(true)
    const res = await proctoService.addPracticeDoctor(practice.id, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      specialty: specialty.trim() || undefined,
      licenseNo: licenseNo.trim() || undefined,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not add doctor.")
      return
    }
    setMessage(
      "Doctor added. They can sign in with this email and password.",
    )
    setName("")
    setEmail("")
    setPassword("")
    setPhone("")
    setSpecialty("")
    setLicenseNo("")
    await load()
  }

  async function removeDoctor(userId: string) {
    if (!practice) return
    setError("")
    setMessage("")
    setBusy(true)
    const res = await proctoService.setPracticeMemberActive(
      practice.id,
      userId,
      false,
    )
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not deactivate doctor.")
      return
    }
    setMessage("Doctor deactivated from the clinic.")
    await load()
  }

  if (loading) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-5xl items-center justify-center">
        <ThinkingLoader size={64} state="working" label="Loading doctors" />
      </div>
    )
  }

  if (!memberships.length) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-3xl flex-col">
        <div className="mb-5 shrink-0">
          <p className="ml-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-primary)]">
            Setup
          </p>
          <h1 className="mt-1 text-3xl font-bold lg:text-4xl">Doctors</h1>
          <p className="mt-2 max-w-xl text-sm opacity-70">
            Create your practice first, then add doctors to the clinic roster.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <OnboardPracticeWizard />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-5xl flex-col">
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ml-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-primary)]">
            Clinic
          </p>
          <h1 className="mt-1 text-3xl font-bold lg:text-4xl">Doctors</h1>
          <p className="mt-2 max-w-xl text-sm opacity-70">
            Manage doctors for {practice?.name}. Create new staff logins from
            this dashboard only — independently registered doctors cannot be
            linked.
          </p>
        </div>
        {memberships.length > 1 ? (
          <select
            value={practiceIdx}
            onChange={(e) => setPracticeIdx(Number(e.target.value))}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          >
            {memberships.map((m, i) => (
              <option key={m.practice.id} value={i}>
                {m.practice.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {(error || message) && (
        <p
          className={`mb-3 shrink-0 text-sm ${
            error
              ? "text-red-600 dark:text-red-300"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {error || message}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto pb-4 lg:grid-cols-2">
        {/* Existing doctors */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Existing doctors</h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-neutral-800">
              {doctors.length}
            </span>
          </div>

          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {doctors.map((m) => (
              <li
                key={m.userId}
                className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-3 dark:border-neutral-700"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.user.name || "Unnamed"}
                    <span className="ml-2 text-xs font-normal opacity-55">
                      {m.role.replace(/_/g, " ")}
                    </span>
                  </p>
                  <p className="truncate text-xs opacity-70">{m.user.email}</p>
                  {m.user.phone ? (
                    <p className="text-xs opacity-70">{m.user.phone}</p>
                  ) : null}
                  {m.user.doctor?.licenseNo ? (
                    <p className="mt-1 text-xs opacity-55">
                      License: {m.user.doctor.licenseNo}
                    </p>
                  ) : null}
                  {m.user.doctor?.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs opacity-55">
                      {m.user.doctor.description}
                    </p>
                  ) : null}
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={practiceTabHref("setup", { doctorId: m.userId })}
                        className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Override settings
                      </Link>
                      <Link
                        href={`/clinic/queue?doctor=${encodeURIComponent(m.userId)}`}
                        className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold dark:border-neutral-600"
                      >
                        Patient status
                      </Link>
                    </div>
                  ) : null}
                </div>
                {canManage && m.role === "DOCTOR" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeDoctor(m.userId)}
                    className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                  >
                    Deactivate
                  </button>
                ) : canManage && m.role === "PRACTICE_OWNER" ? (
                  <span className="shrink-0 text-[11px] opacity-50">Owner</span>
                ) : null}
              </li>
            ))}
            {!doctors.length ? (
              <p className="py-8 text-center text-sm opacity-60">
                No doctors on this clinic yet. Add one on the right.
              </p>
            ) : null}
          </ul>
        </section>

        {/* Add doctor */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/50">
          <h2 className="text-lg font-semibold">Add new doctor</h2>
          <p className="mt-1 text-xs opacity-60">
            Creates a new doctor account. They use Doctor Login to manage their
            own queue, schedule, and visits; you keep roster control here.
            Independent doctor emails cannot be linked.
          </p>

          {!canManage ? (
            <p className="mt-6 text-sm opacity-70">
              Only clinic owners can add or deactivate doctors.{" "}
              <Link
                href={practiceTabHref("calendar")}
                className="font-semibold text-[var(--theme-primary)] underline"
              >
                Open practice
              </Link>
            </p>
          ) : !multiDoctorAllowed ? (
            <div className="mt-6 space-y-3">
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {entitlementHint ||
                  "Upgrade to Growth or Clinic for multi-doctor."}
              </p>
              <Link
                href="/doctor/subscription"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0099ff] px-4 text-sm font-semibold text-white"
              >
                Open Subscription
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
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
              <button
                type="button"
                disabled={busy || !multiDoctorAllowed}
                onClick={() => void addDoctor()}
                className="gg-btn mt-1 w-full !py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Add doctor"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
