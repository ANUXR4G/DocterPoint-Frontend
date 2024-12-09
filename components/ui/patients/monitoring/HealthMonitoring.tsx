"use client"

import React, { useState } from "react"
import { HumanAnatomy, MonitoringSlider } from "@/components"
import { useProfile } from "@/hooks/useProfile"
import { TPatientHealth } from "@/types"
import { useSocket } from "@/hooks/useSocket"
import { useApi } from "@/hooks/useApi"
import { healthServices } from "@/lib/services/health"
import { modifyData } from "@/lib/dummy/health"

export default function HealthMonitoring() {
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  const { data: userInfo } = useProfile()

  const socketURL = userInfo
    ? `ws://localhost:8000/api/v1/ws/monitoring/${userInfo.id}`
    : null

  const { values: healthMonitoringsWS, isConnected } =
    useSocket<TPatientHealth>(socketURL)

  // retrieve patient health record informations
  const { data: healthRecords } = useApi(
    [`patient_${userInfo?.id}_health_record`],
    (_, token) => healthServices.getPatientHealthRecord(token, userInfo?.id),
    {
      enabled: !!userInfo?.id,
    }
  )

  const healthRecordValues = healthMonitoringsWS
    ? healthMonitoringsWS
    : Array.isArray(healthRecords?.data)
    ? undefined
    : healthRecords?.data

  // modified data based on websocket and fetching condition
  const uiData = modifyData(healthRecordValues)

  // toggle modals
  const handleOpenModal = (idx: number) => setActiveIndex(idx)
  const handleCloseModal = () => setActiveIndex(-1)

  return (
    <React.Fragment>
      <HumanAnatomy
        activeIndex={activeIndex}
        openHandler={handleOpenModal}
        closeHandler={handleCloseModal}
        uiData={uiData}
        patientId={userInfo?.id}
        healthRecords={healthRecords && healthRecords.data}
      />
      <div className="absolute left-6 bottom-5 right-0">
        <MonitoringSlider openModal={handleOpenModal} uiData={uiData} />
      </div>
    </React.Fragment>
  )
}
