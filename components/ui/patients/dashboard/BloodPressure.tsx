"use client"

import React, { useState } from "react"

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useRouter } from "next/navigation"
import { TMonitoring, TPatientHealth } from "@/types"
import { systolicPressureData } from "@/lib/dummy/health"
import { BloodPressureSkeleton, Icon, ShinnyEfBtn } from "@/components"

type Props = {
  uiData: TMonitoring[]
  isLoading: boolean
  healthRecord?: TPatientHealth
}

export default function BloodPressure({
  uiData,
  healthRecord,
  isLoading,
}: Props) {
  const [selected, setSelected] = useState<"systolic" | "diastolic">("systolic")

  const router = useRouter()

  function showSystolicRecords() {
    if (selected === "systolic") return
    setSelected("systolic")
  }

  function showDiastolicRecords() {
    if (selected === "diastolic") return
    setSelected("diastolic")
  }

  const bloodPressureDetails = uiData.find(
    (item) => item.key === "blood_pressure_records"
  )

  const isEmpty = !!!(healthRecord && healthRecord.blood_pressure_records)

  // restructure the systolic data for rechart details
  const _systolicPressureData =
    bloodPressureDetails?.details
      ?.filter((item: any) => item.type === "systolic")
      .flatMap((item: any) => item.data) || []

  // restructure the diastolic data for rechart value
  const _diastolicPressureData =
    bloodPressureDetails?.details
      ?.filter((item: any) => item.type === "diastolic")
      .flatMap((item: any) => item.data) || []

  if (isLoading) return <BloodPressureSkeleton />

  return (
    <div className="col-span-2 lg:order-5 lg:row-span-2 py-6 md:py-8 px-4 relative border-2 dark:border-neutral-600 rounded-xl">
      {/* for empty pressure informations */}
      {isEmpty && (
        <div className="absolute center left-0 top-0 z-20 size-full rounded-xl bg-black/80 dark:bg-black/50 backdrop-blur-sm">
          <ShinnyEfBtn
            className="text-neutral-100 text-xs xxs:text-sm px-5 xs:px-8 py-3 xs:text-lg  gradient-border-green rounded-3xl z-10 backdrop-blur-[20px]"
            onClick={() => router.push("/patient/monitoring?metrics=1")}
          >
            Start Monitoring Blood Pressures
          </ShinnyEfBtn>
        </div>
      )}

      {/* blood pressure informations */}
      {bloodPressureDetails && (
        <React.Fragment>
          <div className="flex flex-col px-4">
            <div className="flex flex-col items-start -ml-4 md:ml-0">
              <h4 className="text-base md:text-xl font-bold">Blood Pressure</h4>
              {bloodPressureDetails.value && (
                <div className="flex items-center mt-1">
                  <Icon
                    name="heart-w-pulse"
                    pathClassName="dark:stroke-neutral-400"
                  />
                  <span className="ml-2 opacity-75 text-sm font-bold">
                    Pulse:{" "}
                    {Number(
                      (bloodPressureDetails.value as string).split("/")[0]
                    ) -
                      Number(
                        (bloodPressureDetails.value as string).split("/")[1]
                      )}
                    BPM
                  </span>
                </div>
              )}
            </div>
            {bloodPressureDetails.value && (
              <div className="self-end">
                <div className="mt-4 md:mt-0 text-[--primary-red] flex">
                  <h2 className="text-4xl xxs:text-5xl md:text-6xl font-extrabold">
                    {bloodPressureDetails.value}
                  </h2>
                  <span className="text-sm xxs:text-xl font-bold self-end mb-0.5 xxs:mb-0 md:mb-1 ml-0.5 md:ml-1">
                    {bloodPressureDetails.unit}
                  </span>
                </div>
                <div className="flex flex-col items-end mt-2 xxs:mt-3 md:mt-2">
                  <div
                    onClick={showSystolicRecords}
                    className="flex items-center cursor-pointer mb-1.5 md:mb-2 relative after:absolute after:contents[''] after:left-0 after:-bottom-1 after:h-0.5 after:rounded-sm after:w-full after:bg-[rgb(228,61,61)]/50 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:origin-bottom-right hover:after:origin-bottom-left"
                  >
                    <div className="w-4 h-4 mr-2 rounded-full bg-[rgb(228,61,61)]/50" />
                    <span className="text-sm xs:text-base font-bold opacity-80">
                      systolic:{" "}
                      {(bloodPressureDetails.value as string).split("/")[0]}
                      {bloodPressureDetails.unit}
                    </span>
                  </div>
                  <div
                    onClick={showDiastolicRecords}
                    className="flex items-center cursor-pointer relative after:absolute after:contents[''] after:left-0 after:-bottom-1.5 md:after:-bottom-1 after:h-0.5 after:rounded-sm after:w-full after:bg-[rgb(182,216,127)]/50 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:origin-bottom-right hover:after:origin-bottom-left"
                  >
                    <div className="w-4 h-4 mr-2 rounded-full bg-[rgb(182,216,127)]/50" />
                    <span className="text-sm xs:text-base font-bold mr-0.5 opacity-80">
                      diastolic:{" "}
                      {(bloodPressureDetails.value as string).split("/")[1]}
                      {bloodPressureDetails.unit}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* blood pressure graph */}
          <div className="w-full h-64 mt-8 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                width={300}
                height={300}
                margin={{
                  top: 20,
                  right: 10,
                  bottom: 20,
                  left: -10,
                }}
              >
                <CartesianGrid />
                <XAxis dataKey="time" name="time" tick={{ dy: 8 }} />
                <YAxis
                  type="number"
                  dataKey="value"
                  // dataKey={selected === "systolic" ? "systolic" : "diastolic"}
                  name={selected === "systolic" ? "Systolic" : "Diastolic"}
                  domain={selected === "systolic" ? [60, 180] : [70, 110]}
                  tick={{ dx: -8 }}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  name={
                    selected === "systolic"
                      ? "Systolic Pressures"
                      : "Diastolic Pressures"
                  }
                  data={
                    isEmpty
                      ? systolicPressureData
                      : selected === "systolic"
                      ? _systolicPressureData
                      : _diastolicPressureData
                  }
                  fill={selected === "systolic" ? "#e43d3d" : "#b6d87f"}
                  fillOpacity="0.7"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </React.Fragment>
      )}
    </div>
  )
}
