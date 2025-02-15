"use client"

import {
  AppointmentHistory,
  AppointmentRequests,
  DoctorAnalytics,
  PatientTrackings,
  PatientHistory,
} from "@/components"

export default function DoctorDashboard() {
  return (
    <div className="max-w-[1536px] mx-auto">
      <div className="flex flex-col w-full">
        <h1 className="ml-2 leading text-3xl lg:leading-[64px] lg:text-5xl bg-gradient-to-r font-bold from-blue-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 bg-clip-text text-transparent">
          Overview
        </h1>

        {/* Dashboard contents */}
        <div className="grid grid-cols-4 lg:mt-3 gap-3 text-white text-center">
          {/* List of requested appointments */}
          <AppointmentRequests />

          {/* Analytic metrics of patient, appointments and queue status. */}
          <DoctorAnalytics />

          {/* Patient Tracking Analysis */}
          <PatientTrackings />

          {/* Appointment history of patients who've recenetly been consulted */}
          <AppointmentHistory />

          {/* Patient History */}
          <PatientHistory />
        </div>
      </div>
    </div>
  )
}
