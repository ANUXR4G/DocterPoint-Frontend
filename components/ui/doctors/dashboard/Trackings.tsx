"use client"

import Button from "@/components/buttons/Button"
import Icon from "@/components/icons"
import GenderChart from "@/components/recharts/GenderChart"
import { useAnalytics } from "@/hooks/useAnalysis"
import { TypeAnalyticsParam } from "@/types"
import { useState } from "react"

export default function Trackings() {
  const [type, setType] = useState<TypeAnalyticsParam>("week")

  const { patientMetrics } = useAnalytics(type)

  function changePeriod() {
    if (type === "week") setType("month")
    else setType("week")
  }

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
          <Button type="outline" className="relative">
            See Details
          </Button>
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
