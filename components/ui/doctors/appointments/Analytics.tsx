"use client"

import {
  AppointmentTrendLineChart,
  AnalyticsPeriodFilter,
  PatientGenderBarChart,
} from "@/components/charts/DoctorCharts"
import { useAnalytics } from "@/hooks/useAnalysis"
import { useApi } from "@/hooks/useApi"
import { useDoctor } from "@/hooks/useDoctor"
import { useUser } from "@/hooks/useUser"
import { doctorServices } from "@/lib/services/doctor"
import { TDoctorAppointment, TypeAnalyticsParam } from "@/types"
import { format, startOfToday } from "date-fns"
import { useEffect, useState } from "react"

export default function Analytics() {
  const [hydrated, setHydrated] = useState(false)
  const [type, setType] = useState<TypeAnalyticsParam>("month")

  const today = startOfToday()
  const currentCurrentMonth = format(today, "MMMM")

  const { data } = useUser("doctor")

  const { isLoading, appointmentMetrics } = useAnalytics(type)
  const { calculatePercentage, totalAppointments } = useAnalytics("year")

  const { data: requests } = useDoctor<TDoctorAppointment[]>("requested")

  const appointmentAnalysis = calculatePercentage("appointments")

  const { data: totalAppointmentsToday } = useApi(
    [`doctor:${data?.id}:appointments:total`],
    (_, token) => {
      if (!data) {
        throw new Error(
          `Failed to retrieve total appointment count of today, doctor info required`
        )
      }
      return doctorServices.getTotalAppointmentCount(token, data.id)
    },
    {
      enabled: !!data?.id,
    }
  )

  useEffect(() => {
    setHydrated(true)
  }, [])

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
    <div>
      <div className="min-h-40 w-full grid grid-cols-1 gap-2 xxs:grid-cols-2 md:grid-cols-4 md:gap-3">
        <div className="size-full flex flex-col p-3 md:p-4 2xl:p-4 relative bg-neutral-200 dark:bg-neutral-800 rounded-[26px] shadow-sm border border-neutral-300 dark:border-none dark:gradient-border-black">
          <div className="size-full flex flex-col">
            <h3 className="text-md md:text-lg leading-5 md:leading-[22px] font-semibold md:font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Total Consultation
            </h3>
            <p className="ml-0.5 text-xs leading-5">{currentCurrentMonth}</p>
            <h1 className="mt-auto ml-auto mr-4 font-bold text-3xl sm:text-5xl">
              {totalAppointments}
            </h1>
          </div>
        </div>

        <div className="size-full flex flex-col p-3 md:p-4 2xl:p-4 relative bg-neutral-200 dark:bg-neutral-800 rounded-[26px] shadow-sm border border-neutral-300 dark:border-none dark:gradient-border-black">
          <div className="size-full flex flex-col">
            <h3 className="text-md md:text-lg leading-5 md:leading-[22px] font-semibold md:font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Total Consultation
            </h3>
            <p className="ml-0.5 text-xs leading-5">today</p>
            <h1 className="mt-auto ml-auto mr-4 font-bold text-3xl sm:text-5xl">
              {totalAppointmentsToday || 0}
            </h1>
          </div>
        </div>

        <div className="size-full flex flex-col p-3 md:p-4 2xl:p-4 relative bg-neutral-200 dark:bg-neutral-800 rounded-[26px] shadow-sm border border-neutral-300 dark:border-none dark:gradient-border-black">
          <div className="size-full flex flex-col">
            <h3 className="text-md md:text-lg leading-5 md:leading-[22px] font-semibold md:font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Consultation Requests
            </h3>
            <p className="ml-0.5 text-xs leading-5">
              Number of appointment requests on queue.
            </p>
            <h1 className="mt-auto ml-auto mr-4 font-bold text-3xl sm:text-5xl">
              {requests && requests?.length > 0 ? `${requests.length}+` : 0}
            </h1>
          </div>
        </div>

        <div className="size-full flex flex-col p-3 md:p-4 2xl:p-4 relative bg-neutral-200 dark:bg-neutral-800 rounded-[26px] shadow-sm border border-neutral-300 dark:border-none dark:gradient-border-black">
          <div className="size-full flex flex-col">
            <h3 className="text-md md:text-lg leading-5 md:leading-[22px] font-semibold md:font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Analytics Statics
            </h3>
            <h1
              className={`mt-auto ml-auto font-bold ${
                appointmentAnalysis === 0
                  ? `text-sm leading-4 mb-2 text-center`
                  : `text-xl sm:text-2xl mr-4`
              }`}
            >
              {appointmentAnalysis === 0
                ? "No previous month record"
                : `${appointmentAnalysis}%`}
            </h1>
            {appointmentAnalysis !== 0 && (
              <p className="line-clamp-2 leading-3 sm:leading-4 text-xs text-neutral-500 font-semibold">
                Visit {appointmentAnalysis >= 0 ? `increase` : `decrease`} of{" "}
                {appointmentAnalysis}% from last month
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <AnalyticsPeriodFilter value={type} onChange={setType} />
      </div>

      <div className="mt-3 hidden h-64 grid-cols-1 gap-3 sm:grid md:grid-cols-2 md:h-72">
        <div className="rounded-[26px] border border-neutral-300 bg-neutral-200 p-3 dark:border-none dark:gradient-border-black dark:bg-neutral-800">
          <AppointmentTrendLineChart data={appointmentMetrics} active={type} />
        </div>
        <div className="rounded-[26px] border border-neutral-300 bg-neutral-200 p-3 dark:border-none dark:gradient-border-black dark:bg-neutral-800">
          <PatientGenderBarChart data={appointmentMetrics} active={type} />
        </div>
      </div>
    </div>
  )
}
