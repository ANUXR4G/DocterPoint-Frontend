"use client"

import React from "react"
import { useRouter } from "next/navigation"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts"

import { bloodGlucoseData } from "@/lib/dummy/health"
import { TMonitoring, TPatientHealth } from "@/types"
import { BloodGlucoseSkeleton, ShinnyEfBtn } from "@/components"

type Props = {
  uiData: TMonitoring[]
  isLoading: boolean
  healthRecord?: TPatientHealth
}

export default function BloodGlucose({
  uiData,
  isLoading,
  healthRecord,
}: Props) {
  const router = useRouter()

  // get the blood glucose details information from reconstructed ui data
  const bloodGlucoseDetails = uiData.find(
    (item) => item.key === "blood_glucose_records"
  )

  // check if the blood glucose record is empty
  const isEmpty = !!!(healthRecord && healthRecord.blood_glucose_records)

  // show skeleton for loading state
  if (isLoading) return <BloodGlucoseSkeleton />

  return (
    <div className="col-span-2 relative lg:order-1 lg:row-span-2 border-2 dark:border-neutral-600 rounded-xl flex py-6 md:py-8 px-4 flex-col">
      {/* indicator for empty blood glucose details */}
      {isEmpty && (
        <div className="absolute center left-0 top-0 z-20 size-full rounded-xl bg-black/80 dark:bg-black/50 backdrop-blur-sm">
          <ShinnyEfBtn
            className="text-neutral-100 text-xs xxs:text-sm px-5 xs:px-8 py-3 xs:text-lg  gradient-border-green rounded-3xl z-10 backdrop-blur-[20px]"
            onClick={() => router.push("/patient/monitoring?metrics=0")}
          >
            Start Monitoring Blood Glucose
          </ShinnyEfBtn>
        </div>
      )}

      {/* blood glucose details */}
      {bloodGlucoseDetails && (
        <React.Fragment>
          <div className="flex flex-col px-4">
            <h4 className="text-base md:text-xl font-bold -ml-4 md:ml-0">
              Blood Glucose
            </h4>
            <div className="self-end mt-4 md:mt-0">
              <h2 className="text-3xl md:text-4xl font-bold leading-8 md:leading-9">
                Daily
              </h2>
              <h2 className="text-3xl md:text-4xl font-bold leading-8  md:leading-9">
                Average
              </h2>
              <div className="flex items-center text-[--primary-red] mt-1 md:mt-2">
                {bloodGlucoseDetails.value && (
                  <React.Fragment>
                    <h1 className="text-5xl md:text-6xl font-extrabold">
                      {bloodGlucoseDetails.value}
                    </h1>
                    <span className="text-xl font-bold self-end">
                      {bloodGlucoseDetails.unit}
                    </span>
                  </React.Fragment>
                )}
              </div>
            </div>
          </div>

          {/* chart */}
          <div className="w-full h-56 md:h-64 mt-8 md:mt-16 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                width={300}
                height={300}
                data={isEmpty ? bloodGlucoseData : bloodGlucoseDetails.details}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ dy: 16 }} />
                <YAxis domain={[0, 200]} tick={{ dx: -8 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#8884d8"
                  fill="url(#splitColor)"
                  activeDot={{ r: 6 }}
                />
                <defs>
                  <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="33%" stopColor="#3183FD" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#d9d9d9" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </React.Fragment>
      )}
    </div>
  )
}
