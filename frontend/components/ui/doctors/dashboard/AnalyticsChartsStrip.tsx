"use client"

import { useState } from "react"
import {
  AnalyticsPeriodFilter,
  AppointmentTrendLineChart,
  GenderDoughnutChart,
  PatientGenderBarChart,
} from "@/components/charts/DoctorCharts"
import { useAnalytics } from "@/hooks/useAnalysis"
import { TypeAnalyticsParam } from "@/types"

/** Chart.js strip — loaded separately so dashboards don't pay chart cost up front. */
export function AnalyticsChartsStrip() {
  const [period, setPeriod] = useState<TypeAnalyticsParam>("week")
  const { patientMetrics, appointmentMetrics, planLocked, isLoading } =
    useAnalytics(period)

  const male = patientMetrics.reduce((s, m) => s + m.male, 0)
  const female = patientMetrics.reduce((s, m) => s + m.female, 0)
  const others = patientMetrics.reduce((s, m) => s + (m.others ?? 0), 0)
  const unknown = patientMetrics.reduce((s, m) => s + (m.unknown ?? 0), 0)
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
    <div className="space-y-3">
      <div className="flex h-10 items-center justify-end gap-3">
        <AnalyticsPeriodFilter value={period} onChange={setPeriod} />
      </div>
      {planLocked ? (
        <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300">
          Analytics charts unlock with an active subscription. Patient and
          appointment totals above are live from your clinic.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-neutral-500">Loading charts…</p>
      ) : (
        <div className="dashboard-grid-3">
          <div className="dashboard-panel dashboard-panel-chart">
            <PatientGenderBarChart data={patientMetrics} active={period} />
          </div>
          <div className="dashboard-panel dashboard-panel-chart">
            <GenderDoughnutChart
              male={male}
              female={female}
              others={others}
              unknown={unknown}
              compareMale={compareMale}
              compareFemale={compareFemale}
              compareOthers={compareOthers}
              compareUnknown={compareUnknown}
              mode={period === "yoy" ? "yoy" : "gender"}
            />
          </div>
          <div className="dashboard-panel dashboard-panel-chart">
            <AppointmentTrendLineChart
              data={appointmentMetrics}
              active={period}
            />
          </div>
        </div>
      )}
    </div>
  )
}
