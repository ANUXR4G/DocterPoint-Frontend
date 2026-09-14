"use client"

import { useState } from "react"
import { TypeAnalyticsParam } from "@/types"
import { useAnalytics } from "@/hooks/useAnalysis"
import { ShinnyEfBtn } from "@/components"
import Link from "next/link"
import {
  AnalyticsPeriodFilter,
  PatientGenderBarChart,
} from "@/components/charts/DoctorCharts"

const PERIOD_LABEL: Record<TypeAnalyticsParam, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  yoy: "This vs last year",
}

export default function Trackings() {
  const [type, setType] = useState<TypeAnalyticsParam>("week")

  const { patientMetrics } = useAnalytics(type)

  const isEmpty = patientMetrics.every(
    (item) => item.male === 0 && item.female === 0,
  )

  return (
    <div className="relative rounded-2xl border border-neutral-300 bg-neutral-200 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex flex-wrap items-start gap-3">
        <div className="ml-1 flex flex-col text-start">
          <h2 className="text-xl font-bold text-neutral-700 dark:text-neutral-200">
            Patient Trackings
          </h2>
          <p className="text-sm font-semibold text-neutral-500">
            {PERIOD_LABEL[type]}
          </p>
        </div>
        <div className="relative ml-auto flex flex-wrap items-center gap-2">
          <AnalyticsPeriodFilter value={type} onChange={setType} />
          <Link
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-600 shadow-sm hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-300 dark:text-neutral-900 dark:hover:bg-neutral-200"
            href="/doctor/analytics"
          >
            view analytics
          </Link>
        </div>
      </div>

      {isEmpty && type !== "yoy" ? (
        <div className="mt-4 flex justify-center py-6">
          <ShinnyEfBtn className="[&&]:cursor-default rounded-3xl px-6 py-3 text-sm text-neutral-100 gradient-border-green">
            {`No Patient Record Available · ${PERIOD_LABEL[type]}`}
          </ShinnyEfBtn>
        </div>
      ) : patientMetrics.length > 0 ? (
        <div className="mt-3 h-[220px]">
          <PatientGenderBarChart data={patientMetrics} active={type} />
        </div>
      ) : null}
    </div>
  )
}
