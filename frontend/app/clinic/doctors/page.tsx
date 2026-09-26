"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format, startOfToday } from "date-fns"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import {
  CLINIC_SUBSCRIPTION_HREF,
  practiceTabHref,
} from "@/lib/doctorPracticeTabs"
import { proctoService } from "@/lib/services/procto"
import {
  filterBookingsByDate,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"
import { useAnalytics } from "@/hooks/useAnalysis"
import { matchesQueueStatusFilter } from "@/lib/bookingStatus"

type RosterDoctor = {
  id: string
  name: string
  email: string | null
  role: string
  phone?: string | null
}

/**
 * Clinic-wide doctors overview: roster + today + period stats, with links to
 * analyze / queue each doctor one by one.
 */
export default function ClinicDoctorsPage() {
  const { memberships, bookings: allBookings, ready, isClinicAdmin } =
    usePracticeDashboard()
  const { byDoctor, planLocked, isLoading: analyticsLoading } = useAnalytics(
    "week",
    null,
  )

  const [multiDoctorAllowed, setMultiDoctorAllowed] = useState(true)
  const [entitlementHint, setEntitlementHint] = useState("")

  const practice = memberships[0]?.practice
  const practiceId = practice?.id ?? null
  const today = format(startOfToday(), "yyyy-MM-dd")
  const todayBookings = useMemo(
    () => filterBookingsByDate(allBookings, today),
    [allBookings, today],
  )

  const roster = useMemo((): RosterDoctor[] => {
    const members = practice?.members ?? []
    return members
      .filter(
        (m) =>
          m.isActive !== false &&
          (m.role === "DOCTOR" ||
            m.role === "PRACTICE_OWNER" ||
            m.role === "PRACTICE_ADMIN"),
      )
      .map((m) => ({
        id: m.userId,
        name: m.user?.name || m.user?.email || "Doctor",
        email: m.user?.email ?? null,
        role: m.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [practice?.members])

  const todayByDoctor = useMemo(() => {
    const map = new Map<
      string,
      { waiting: number; inAppointment: number; booked: number; done: number }
    >()
    for (const b of todayBookings) {
      const id =
        (b as { providerId?: string }).providerId || b.provider?.id || ""
      if (!id) continue
      if (!map.has(id)) {
        map.set(id, { waiting: 0, inAppointment: 0, booked: 0, done: 0 })
      }
      const row = map.get(id)!
      if (matchesQueueStatusFilter(b.status, "waiting")) row.waiting += 1
      else if (matchesQueueStatusFilter(b.status, "in_appointment"))
        row.inAppointment += 1
      else if (matchesQueueStatusFilter(b.status, "done")) row.done += 1
      else if (
        matchesQueueStatusFilter(b.status, "booked") ||
        matchesQueueStatusFilter(b.status, "accepted")
      ) {
        row.booked += 1
      }
    }
    return map
  }, [todayBookings])

  const periodByDoctor = useMemo(() => {
    const map = new Map<string, (typeof byDoctor)[number]>()
    for (const d of byDoctor) map.set(d.providerId, d)
    return map
  }, [byDoctor])

  const loadEntitlement = useCallback(async () => {
    if (!practiceId) return
    const billing = await proctoService.getPracticeBilling(practiceId)
    if (billing.status !== "successful" || !billing.data) return
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
    const doctorMembers = roster.filter((d) => d.role === "DOCTOR").length
    setMultiDoctorAllowed(Boolean(ent?.usable) && (multi || doctorMembers < 1))
    if (!ent?.usable) {
      setEntitlementHint(
        "Active subscription required to add doctors. Open Subscription to subscribe.",
      )
    } else if (doctorMembers >= 1 && !multi) {
      setEntitlementHint(
        "Multi-doctor clinics require Growth or Clinic. Upgrade under Subscription.",
      )
    } else {
      setEntitlementHint("")
    }
  }, [practiceId, roster])

  useEffect(() => {
    if (!ready) return
    void loadEntitlement()
  }, [ready, loadEntitlement])

  if (!ready) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-500">Loading doctors…</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page-wide space-y-6">
      <DashboardPageHeader
        eyebrow="Clinic"
        title={
          <>
            Doctors{" "}
            <span className="text-blue-600 dark:text-sky-400">overview</span>
          </>
        }
        subtitle="Override any doctor’s hours, open their queue to change patient status, or dig into analytics."
        action={
          isClinicAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/clinic/dashboard#add-doctor"
                className="inline-flex h-11 items-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Add doctor
              </Link>
              <Link
                href={practiceTabHref("doctors")}
                className="inline-flex h-11 items-center rounded-full border border-slate-200 px-5 text-sm font-semibold dark:border-white/15"
              >
                Manage roster
              </Link>
            </div>
          ) : null
        }
      />

      {!multiDoctorAllowed && entitlementHint ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {entitlementHint}{" "}
          <Link
            href={CLINIC_SUBSCRIPTION_HREF}
            className="font-semibold underline"
          >
            Open Subscription
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Roster
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{roster.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Bookings today
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {todayBookings.length}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Period bookings (week)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {planLocked || analyticsLoading
              ? "—"
              : byDoctor.reduce((s, d) => s + d.bookings, 0)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/60">
          <h2 className="text-sm font-semibold">All doctors</h2>
          <p className="text-xs text-neutral-500">
            Today’s queue counts and this week’s analytics — open one doctor to
            dig in
          </p>
        </div>

        {roster.length === 0 ? (
          <p className="px-4 py-8 text-sm text-neutral-500">
            No doctors on the roster yet.{" "}
            <Link
              href="/clinic/dashboard#add-doctor"
              className="font-semibold text-blue-600 underline dark:text-sky-400"
            >
              Add a doctor
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {roster.map((d) => {
              const today = todayByDoctor.get(d.id) || {
                waiting: 0,
                inAppointment: 0,
                booked: 0,
                done: 0,
              }
              const period = periodByDoctor.get(d.id)
              return (
                <li
                  key={d.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 dark:text-white">
                      {d.name}
                      <span className="ml-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {d.role.replace(/_/g, " ")}
                      </span>
                    </p>
                    {d.email ? (
                      <p className="truncate text-xs text-neutral-500">
                        {d.email}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-neutral-500">
                      Today: Waiting {today.waiting} · In appt{" "}
                      {today.inAppointment} · Booked {today.booked} · Done{" "}
                      {today.done}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Booking type is set per doctor under Hours &amp; blocks
                      (Time slots or Token queue). Switches apply tomorrow.
                    </p>
                    <p className="text-xs text-neutral-500">
                      This week:{" "}
                      {period
                        ? `${period.bookings} bookings · ${period.completed} completed · ${period.waiting} waiting`
                        : planLocked
                          ? "Subscribe to unlock period analytics"
                          : analyticsLoading
                            ? "Loading…"
                            : today.waiting +
                                  today.inAppointment +
                                  today.booked +
                                  today.done >
                                0
                              ? "Today has visits — open queue for details"
                              : "No bookings in period"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={practiceTabHref("setup", { doctorId: d.id })}
                      className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Override settings
                    </Link>
                    <Link
                      href={`/clinic/queue?doctor=${encodeURIComponent(d.id)}`}
                      className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-3 text-xs font-semibold dark:border-neutral-600"
                    >
                      Queue & status
                    </Link>
                    <Link
                      href={`/clinic/analytics?doctor=${encodeURIComponent(d.id)}`}
                      className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-3 text-xs font-semibold dark:border-neutral-600"
                    >
                      Analyze
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
