"use client"

import type { AnalyticMetrics, TypeAnalyticsParam } from "@/types"
import {
  AppointmentTrendLineChart,
  GenderDoughnutChart,
  PatientGenderBarChart,
} from "@/components/charts/DoctorCharts"

type Props = {
  period: TypeAnalyticsParam
  patientMetrics: AnalyticMetrics[]
  appointmentMetrics: AnalyticMetrics[]
  maleTotal: number
  femaleTotal: number
  othersTotal?: number
  unknownTotal?: number
  compareMale: number
  compareFemale: number
  compareOthers?: number
  compareUnknown?: number
}

export default function DoctorAnalyticsChartPanel({
  period,
  patientMetrics,
  appointmentMetrics,
  maleTotal,
  femaleTotal,
  othersTotal = 0,
  unknownTotal = 0,
  compareMale,
  compareFemale,
  compareOthers = 0,
  compareUnknown = 0,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="relative min-h-[320px] rounded-2xl border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800 xl:col-span-2">
        <div className="h-[280px]">
          <PatientGenderBarChart data={patientMetrics} active={period} />
        </div>
      </div>

      <div className="min-h-[320px] rounded-2xl border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="h-[280px]">
          <GenderDoughnutChart
            male={maleTotal}
            female={femaleTotal}
            others={othersTotal}
            unknown={unknownTotal}
            compareMale={compareMale}
            compareFemale={compareFemale}
            compareOthers={compareOthers}
            compareUnknown={compareUnknown}
            mode={period === "yoy" ? "yoy" : "gender"}
          />
        </div>
      </div>

      <div className="min-h-[340px] rounded-2xl border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800 xl:col-span-3">
        <div className="h-[300px]">
          <AppointmentTrendLineChart
            data={appointmentMetrics}
            active={period}
          />
        </div>
      </div>
    </div>
  )
}
