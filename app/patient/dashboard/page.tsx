"use client"

import {
  BloodGlucose,
  BloodPressure,
  ConnectDeviceBanner,
  ConsultDoctors,
  Greeting,
  HealthInformations,
  PendingTasks,
} from "@/components"

import { TPatientHealth } from "@/types"
import { modifyData } from "@/lib/dummy/health"
import { patientService } from "@/lib/services/patient"

import { useApi } from "@/hooks/useApi"
import { useProfile } from "@/hooks/useProfile"
import { useSocket } from "@/hooks/useSocket"
import { useRef, useState } from "react"

export default function Dashboard() {
  // retrieve patient health record informations
  const { data: profile } = useProfile()
  const { data: healthRecord, isLoading: recordLoading } = useApi(
    [`patients:monitorings:${profile?.id}`],
    (_, token) => patientService.getPatientHealthRecord(token),
    {
      enabled: !!profile?.id,
    }
  )

  // define the url of the socket room using the users id
  const socketURL = profile
    ? `ws://localhost:8000/api/v1/ws/monitoring/${profile.id}`
    : null

  // utilize the hook to connect with socket room
  const { values: healthMonitoringsWS } = useSocket<TPatientHealth>(socketURL)

  // select which value to display in ui based on the sockets connectivity
  const healthRecordValues = healthMonitoringsWS
    ? healthMonitoringsWS
    : Array.isArray(healthRecord)
    ? undefined
    : healthRecord

  // modified data based on websocket and retrieved health record informations
  const uiData = modifyData(healthRecordValues)

  const isLoading = recordLoading || !healthRecord

  return (
    <div className="mb-4">
      <Greeting />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2 3xl:mt-3">
        <PendingTasks isLoading={isLoading} />
        <HealthInformations
          healthRecord={healthRecordValues}
          isLoading={isLoading}
        />
        <ConsultDoctors isLoading={isLoading} />
        <ConnectDeviceBanner isLoading={isLoading} />
        <BloodGlucose
          uiData={uiData}
          healthRecord={healthRecordValues}
          isLoading={isLoading}
        />
        <BloodPressure
          uiData={uiData}
          healthRecord={healthRecordValues}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
