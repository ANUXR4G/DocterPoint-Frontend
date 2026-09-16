"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "react-query"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import { TypeAnalyticsParam } from "@/types"
import { useAnalytics } from "@/hooks/useAnalysis"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { AnalyticsPeriodFilter } from "@/components/charts/DoctorCharts"

const DoctorAnalyticsChartPanel = dynamic(
  () => import("@/components/charts/DoctorAnalyticsChartPanel"),
  {
    ssr: false,
    loading: () => (
      <div role="status" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-neutral-700/75 ${
              i === 0 ? "min-h-[320px] xl:col-span-2" : "min-h-[320px]"
            }`}
          />
        ))}
        <span className="sr-only">Loading charts…</span>
      </div>
    ),
  },
)

const PERIOD_SUBTITLE: Record<TypeAnalyticsParam, string> = {
  day: "Today by hour",
  week: "This week",
  month: "This month by day",
  year: "This year by month",
  yoy: "This year vs last year",
}

export default function DoctorAnalyticsPage() {
  const queryClient = useQueryClient()
  const { bookings } = usePracticeDashboard()
  const [type, setType] = useState<TypeAnalyticsParam>("week")
  const [providerId, setProviderId] = useState<string>("")

  const {
    patientMetrics,
    appointmentMetrics,
    totalPatients,
    totalAppointments,
    errorMessage,
    planLocked,
    byDoctor,
    isLoading,
    practiceId,
  } = useAnalytics(type, providerId || null)

  const [doctorOptions, setDoctorOptions] = useState(byDoctor)
  useEffect(() => {
    if (!providerId && byDoctor.length) setDoctorOptions(byDoctor)
  }, [providerId, byDoctor])

  function softRefreshAnalytics() {
    if (!practiceId) return
    void queryClient.invalidateQueries([
      `procto:practice:${practiceId}:analytics`,
    ])
  }

  const bookingsLiveKey = useMemo(
    () => bookings.map((b) => `${b.id}:${b.status}`).join("|"),
    [bookings],
  )

  useEffect(() => {
    softRefreshAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on booking live updates
  }, [bookingsLiveKey, practiceId])

  const maleTotal = patientMetrics.reduce((s, m) => s + m.male, 0)
  const femaleTotal = patientMetrics.reduce((s, m) => s + m.female, 0)
  const othersTotal = patientMetrics.reduce((s, m) => s + (m.others ?? 0), 0)
  const unknownTotal = patientMetrics.reduce(
    (s, m) => s + (m.unknown ?? 0),
    0,
  )
  const compareMale = patientMetrics.reduce(
    (s, m) => s + (m.compareMale ?? 0),
    0,
  )
  const compareFemale = patientMetrics.reduce(
    (s, m) => s + (m.compareFemale ?? 0),
    0,
  )
  const compareOthers = patientMetrics.reduce(
    (s, m) => s + (m.compareOthers ?? 0),
    0,
  )
  const compareUnknown = patientMetrics.reduce(
    (s, m) => s + (m.compareUnknown ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      {planLocked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
            Activate a plan to unlock analytics
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-amber-900/80 dark:text-amber-100/80">
            {errorMessage ||
              "Charts need an active Starter, Growth, or Clinic subscription."}
          </p>
          <Link
            href="/doctor/subscription"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#0099ff] px-4 text-sm font-semibold text-white"
          >
            View plans & subscribe
          </Link>
        </div>
      ) : null}

      {!planLocked ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-300 bg-neutral-100 p-5 dark:border-neutral-700 dark:bg-neutral-800">
            <p className="text-sm font-semibold text-blue-600 dark:text-cyan-400">
              Total patients (this period)
            </p>
            <p className="mt-2 text-3xl font-bold">{totalPatients}</p>
          </div>
          <div className="rounded-2xl border border-neutral-300 bg-neutral-100 p-5 dark:border-neutral-700 dark:bg-neutral-800">
            <p className="text-sm font-semibold text-blue-600 dark:text-cyan-400">
              Total bookings (this period)
            </p>
            <p className="mt-2 text-3xl font-bold">{totalAppointments}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Practice analytics</h2>
          <p className="text-sm opacity-70">{PERIOD_SUBTITLE[type]}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {doctorOptions.length > 1 || providerId ? (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Doctor filter</span>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                aria-label="Filter charts by doctor"
              >
                <option value="">All doctors</option>
                {doctorOptions.map((d) => (
                  <option key={d.providerId} value={d.providerId}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <AnalyticsPeriodFilter value={type} onChange={setType} />
          <Link
            href={practiceTabHref("patients")}
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-600 shadow-sm hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-300 dark:text-neutral-900"
          >
            View patients
          </Link>
        </div>
      </div>

      {planLocked ? null : isLoading ? (
        <p className="text-sm text-neutral-500">Loading charts…</p>
      ) : (
        <DoctorAnalyticsChartPanel
          period={type}
          patientMetrics={patientMetrics}
          appointmentMetrics={appointmentMetrics}
          maleTotal={maleTotal}
          femaleTotal={femaleTotal}
          othersTotal={othersTotal}
          unknownTotal={unknownTotal}
          compareMale={compareMale}
          compareFemale={compareFemale}
          compareOthers={compareOthers}
          compareUnknown={compareUnknown}
        />
      )}

      {!planLocked && byDoctor.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700">
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/60">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              By doctor
            </h3>
            <p className="text-xs text-neutral-500">
              Bookings in the selected period
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900/40">
                <tr>
                  <th className="px-4 py-2 font-semibold">Doctor</th>
                  <th className="px-4 py-2 font-semibold">Bookings</th>
                  <th className="px-4 py-2 font-semibold">Waiting</th>
                  <th className="px-4 py-2 font-semibold">In progress</th>
                  <th className="px-4 py-2 font-semibold">Completed</th>
                  <th className="px-4 py-2 font-semibold">Canceled</th>
                  <th className="px-4 py-2 font-semibold">No-show</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {byDoctor.map((d) => (
                  <tr key={d.providerId}>
                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                    <td className="px-4 py-2.5">{d.bookings}</td>
                    <td className="px-4 py-2.5">{d.waiting}</td>
                    <td className="px-4 py-2.5">{d.inProgress}</td>
                    <td className="px-4 py-2.5">{d.completed}</td>
                    <td className="px-4 py-2.5">{d.canceled}</td>
                    <td className="px-4 py-2.5">{d.noShow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
