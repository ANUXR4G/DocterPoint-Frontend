"use client"

import { useEffect, useState } from "react"
import { TypeAnalyticsParam } from "@/types"
import { useAnalytics } from "@/hooks/useAnalysis"
import { Button, Icon, GenderChart } from "@/components"
import Link from "next/link"

export default function Trackings() {
  const [hydrated, setHydrated] = useState(false)
  const [type, setType] = useState<TypeAnalyticsParam>("week")

  // Retrieve the patient analytic metrics
  const { patientMetrics, isLoading } = useAnalytics(type)

  // Sort by different format of time periods 'week', 'month'
  function changePeriod() {
    if (type === "week") setType("month")
    else setType("week")
  }

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Display loading skeleton UI
  if (!hydrated && !isLoading)
    return (
      <div
        role="status"
        className="animate-pulse h-80 rounded-[26px] sm:h-[336px] w-full lg:order-3 col-span-4 lg:col-span-3 bg-gray-300/80 dark:bg-neutral-700/75"
      >
        <span className="sr-only">Loading...</span>
      </div>
    )

  return (
    <div
      className={`h-80 sm:h-[336px] w-full p-4 lg:order-3 col-span-4 lg:col-span-3 relative bg-neutral-200 dark:bg-neutral-800 rounded-[26px] shadow-sm border border-neutral-300 dark:border-none dark:gradient-border-black`}
    >
      <div className="mt-3 hidden sm:flex items-center">
        <div className="flex flex-col ml-4 text-start">
          <h2 className="text-2xl font-bold text-neutral-600 dark:text-neutral-300">
            Patient Trackings
          </h2>
          <p className="text-neutral-500 text-sm font-semibold">
            {type === "week" ? `This week` : `This year`}
          </p>
        </div>
        <div className="relative flex gap-3 ml-auto mr-2.5">
          <Button
            type="outline"
            className="relative w-48 center"
            onClick={changePeriod}
          >
            <Icon
              name="calendar"
              className="size-5 -mr-0.5"
              pathClassName="stroke-neutral-600"
            />
            <span>
              {type === "week" ? `Change to months` : `Change to days`}
            </span>
          </Button>
          <Link
            className="bg-white dark:bg-neutral-300 text-neutral-600 shadow-sm hover:bg-gray-50 hover:text-neutral-700 dark:hover:bg-neutral-200 focus:outline outline-offset-2 focus:outline-blue-400 py-2 px-3 inline-flex items-center font-semibold gap-x-2 text-sm rounded-lg border border-gray-200"
            href="/doctor/appointments/patients"
          >
            view patients
          </Link>
        </div>
      </div>
      <div className="size-full center flex-col text-neutral-500 font-medium sm:hidden">
        <h2 className="text-3xl">Patient Trackings</h2>
        <p>View in Large devices only</p>
      </div>
      {patientMetrics.length > 0 && (
        <div className="h-full hidden sm:block">
          <GenderChart data={patientMetrics} active={type} />
        </div>
      )}
    </div>
  )
}
