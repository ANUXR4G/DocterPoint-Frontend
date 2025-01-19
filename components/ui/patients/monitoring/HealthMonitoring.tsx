"use client"

import { TPatientHealth } from "@/types"
import React, { useState } from "react"
import { useApi } from "@/hooks/useApi"
import { useSocket } from "@/hooks/useSocket"
import { useProfile } from "@/hooks/useProfile"
import { modifyData } from "@/lib/dummy/health"
import { patientService } from "@/lib/services/patient"
import { HumanAnatomy, MonitoringSlider } from "@/components"
import { useRouter, useSearchParams } from "next/navigation"

export default function HealthMonitoring() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramsExists = searchParams.size !== 0

  const metricsActive = searchParams.get("metrics") || 3
  const [activeIndex, setActiveIndex] = useState<number>(Number(metricsActive))

  const { data: userInfo } = useProfile()

  // define the url of the socket url using the users id
  const socketURL = userInfo
    ? `ws://localhost:8000/api/v1/ws/monitoring/${userInfo.id}`
    : null

  // connect the socket through the hook
  const {
    values: healthMonitoringsWS,
    isConnected,
    isReconnecting,
  } = useSocket<TPatientHealth>(socketURL)

  // retrieve patient health record informations
  const { data: healthRecords } = useApi(
    [`patients:monitorings:${userInfo?.id}`],
    (_, token) => patientService.getPatientHealthRecord(token),
    {
      enabled: !!userInfo?.id,
    }
  )

  // select which value to display based on the sockets connectivity
  const healthRecordValues = healthMonitoringsWS
    ? healthMonitoringsWS
    : Array.isArray(healthRecords)
    ? undefined
    : healthRecords

  // modified data based on websocket and fetching condition
  const uiData = modifyData(healthRecordValues)

  // toggle modals
  const handleOpenModal = (idx: number) => {
    if (paramsExists) {
      router.push("?")
    }
    setActiveIndex(idx)
  }
  const handleCloseModal = () => {
    if (paramsExists) {
      router.push("?")
    }
    setActiveIndex(-1)
  }

  return (
    <React.Fragment>
      {/* connection status */}
      <div className="flex items-center absolute top-5 left-5 gap-2">
        <span className="relative flex size-3">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isConnected ? `bg-sky-400` : `bg-red-400`
            }`}
          ></span>
          <span
            className={`relative inline-flex rounded-full size-3 ${
              isConnected ? `bg-sky-500` : `bg-red-500`
            }`}
          ></span>
        </span>
        <span
          className={`text-sm bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text ${
            isConnected ? `text-transparent font-semibold` : `text-red-500`
          }`}
        >
          {isConnected
            ? `Device Connected`
            : isReconnecting
            ? `Device Reconnecting`
            : `Device Not Connected`}
        </span>
      </div>

      {/* human antomy object and modals for each records*/}
      <HumanAnatomy
        activeIndex={activeIndex}
        openHandler={handleOpenModal}
        closeHandler={handleCloseModal}
        uiData={uiData}
        patientId={userInfo?.id}
        healthRecords={healthRecords}
      />

      {/* monitoring slider (also modal indicators) */}
      <div className="absolute left-6 bottom-5 right-0">
        <MonitoringSlider openModal={handleOpenModal} uiData={uiData} />
      </div>
    </React.Fragment>
  )
}
