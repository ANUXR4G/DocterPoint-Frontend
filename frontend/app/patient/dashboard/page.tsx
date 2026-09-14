"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  formatBookingWhenDetailed,
  bookingWhenMs,
  isActiveBooking,
  sortBookingsByWhen,
} from "@/lib/bookingDisplay"
import { usePatientLiveSocket } from "@/hooks/useProctoSocket"
import { applyLiveBookingEvent } from "@/lib/liveBooking"

function statusTone(status: string) {
  switch ((status || "").toUpperCase()) {
    case "IN_PROGRESS":
      return "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200"
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-200"
    case "CANCELED":
    case "NO_SHOW":
      return "bg-neutral-500/10 text-neutral-600 ring-1 ring-neutral-400/30 dark:text-neutral-300"
    default:
      return "bg-blue-500/10 text-blue-800 ring-1 ring-blue-500/25 dark:text-sky-100"
  }
}

function formatWhen(booking: ProctoBooking) {
  return formatBookingWhenDetailed(booking)
}

function nextVisitLabel(booking: ProctoBooking | undefined) {
  if (!booking) return "No visit scheduled"
  const whenMs = bookingWhenMs(booking)
  if (!whenMs) return "Scheduled"
  const when = new Date(whenMs)
  const now = new Date()
  const diffDays = Math.ceil(
    (when.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  return `In ${diffDays} days`
}

export default function Dashboard() {
  const [bookings, setBookings] = useState<ProctoBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    if (!opts?.silent) setLoadError("")
    const res = await proctoService.getMyBookings()
    if (res?.status === "successful") {
      setBookings((res.data as ProctoBooking[]) ?? [])
    } else if (!opts?.silent) {
      setBookings([])
      setLoadError(res?.message || "Could not load your bookings.")
    }
    if (!opts?.silent) setLoading(false)
  }, [])

  const softRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function scheduleSoftRefresh() {
    if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current)
    softRefreshTimer.current = setTimeout(() => {
      void load({ silent: true })
    }, 250)
  }

  useEffect(() => {
    void load()
    return () => {
      if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current)
    }
  }, [load])

  usePatientLiveSocket(
    true,
    (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        !("event" in event) ||
        (event.event !== "booking_created" &&
          event.event !== "booking_updated")
      ) {
        return
      }
      const incoming =
        "booking" in event
          ? (event.booking as Record<string, unknown>)
          : undefined
      setBookings((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          String(event.event),
          incoming,
        )
        if (needsRefresh) scheduleSoftRefresh()
        return next
      })
    },
    () => scheduleSoftRefresh(),
  )

  const upcoming = useMemo(
    () => sortBookingsByWhen(bookings.filter(isActiveBooking), "asc"),
    [bookings],
  )
  const completed = useMemo(
    () =>
      bookings.filter((b) => (b.status || "").toUpperCase() === "COMPLETED"),
    [bookings],
  )
  const clinics = useMemo(() => {
    const names = new Set(
      bookings
        .map((b) => b.practice?.name)
        .filter((n): n is string => Boolean(n)),
    )
    return names.size
  }, [bookings])

  const nextVisit = upcoming[0]

  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Patient portal"
        title={
          <>
            Your care,{" "}
            <span className="text-blue-600 dark:text-sky-400">at a glance</span>
          </>
        }
        subtitle="Book a clinic, check what's next, and open visit details in one tap."
        actionBelow
        action={
          <>
            <Link href="/practices" className="dashboard-btn-primary">
              Find a clinic
            </Link>
            <Link href="/patient/bookings" className="dashboard-btn-secondary">
              All bookings
            </Link>
          </>
        }
      />

      {loading && bookings.length === 0 ? (
        <div role="status" className="dashboard-grid-4 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-h-[9.5rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      ) : (
        <div className="dashboard-grid-4">
          <InsightStatCard
            title="Upcoming"
            value={upcoming.length}
            subtitle="Active bookings on your queue"
            href="/patient/bookings"
            icon="calendar"
            tone="blue"
          />
          <InsightStatCard
            title="Completed"
            value={completed.length}
            subtitle="Past visits on record"
            href="/patient/bookings"
            icon="heart-w-pulse"
            tone="green"
          />
          <InsightStatCard
            title="Clinics"
            value={clinics}
            subtitle="Care locations you've visited"
            href="/practices"
            icon="monitoring"
            tone="rose"
          />
          <InsightStatCard
            title="Next visit"
            value={nextVisit ? nextVisitLabel(nextVisit) : "—"}
            subtitle={
              nextVisit
                ? `${nextVisit.practice?.name || "Clinic"} · ${formatWhen(nextVisit)}`
                : "Book a clinic to get started"
            }
            href={nextVisit ? `/patient/bookings/${nextVisit.id}` : "/practices"}
            icon="energy"
            tone="amber"
          />
        </div>
      )}

      {!loading && !loadError && nextVisit ? (
        <Link
          href={`/patient/bookings/${nextVisit.id}`}
          className="dashboard-row relative border-sky-100 bg-white/90 dark:border-white/10 dark:bg-white/5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Next up
            </p>
            <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-white">
              {nextVisit.practice?.name || "Clinic"}
              {nextVisit.provider?.name
                ? ` · Dr ${nextVisit.provider.name}`
                : ""}
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              {formatWhen(nextVisit)}
            </p>
            {Array.isArray(nextVisit.medicines) &&
            nextVisit.medicines.length > 0 ? (
              <p className="mt-1 truncate text-xs font-medium text-teal-700 dark:text-teal-300">
                Medicines:{" "}
                {nextVisit.medicines
                  .map((m) => m.name)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ")}
                {nextVisit.medicines.length > 3
                  ? ` +${nextVisit.medicines.length - 3}`
                  : ""}
              </p>
            ) : null}
          </div>
          <span
            className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-bold uppercase ${statusTone(nextVisit.status)}`}
          >
            {(nextVisit.status || "").replace(/_/g, " ")}
          </span>
        </Link>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 h-11 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="dashboard-grid-2">
        <section>
          <div className="mb-4 flex h-12 flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="dashboard-section-title">Upcoming visits</h2>
              <p className="dashboard-section-sub">
                Active bookings on the clinic queue
              </p>
            </div>
            <Link href="/patient/bookings" className="dashboard-link">
              View history →
            </Link>
          </div>

          {loading && upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">Loading visits…</p>
          ) : loadError ? null : upcoming.length === 0 ? (
            <div className="dashboard-panel flex min-h-[12rem] flex-col items-center justify-center border-dashed text-center">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No upcoming visits
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Find a clinic and book a slot or token.
              </p>
              <Link href="/practices" className="dashboard-btn-primary mt-5">
                Browse clinics
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/patient/bookings/${b.id}`}
                    className="dashboard-row"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                        {b.practice?.name || "Clinic"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                        {b.provider?.name
                          ? `Dr ${b.provider.name}`
                          : "Doctor TBA"}{" "}
                        · {formatWhen(b)}
                      </p>
                    </div>
                    <div className="flex h-8 shrink-0 items-center gap-3">
                      <span
                        className={`inline-flex h-8 items-center rounded-full px-3 text-[11px] font-bold uppercase ${statusTone(b.status)}`}
                      >
                        {(b.status || "").replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-semibold text-blue-600 dark:text-sky-400">
                        Open
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="dashboard-section-title">Visit summary</h2>
              <p className="dashboard-section-sub">Your booking breakdown</p>
            </div>
          </div>
          <ul className="space-y-4">
            {[
              {
                label: "Upcoming",
                value: upcoming.length,
                pct: bookings.length
                  ? Math.round((upcoming.length / bookings.length) * 100)
                  : 0,
                color: "bg-blue-500",
              },
              {
                label: "Completed",
                value: completed.length,
                pct: bookings.length
                  ? Math.round((completed.length / bookings.length) * 100)
                  : 0,
                color: "bg-emerald-500",
              },
              {
                label: "Clinics visited",
                value: clinics,
                pct: clinics ? Math.min(clinics * 20, 100) : 0,
                color: "bg-rose-400",
              },
            ].map((row) => (
              <li key={row.label}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {row.label}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {row.value}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/practices"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-800 transition hover:border-blue-300 dark:border-white/15 dark:text-white"
          >
            Book another visit
          </Link>
        </section>
      </div>
    </div>
  )
}
