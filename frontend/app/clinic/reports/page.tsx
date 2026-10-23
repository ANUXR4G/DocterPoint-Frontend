"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorReportsPage from "@/components/ui/doctors/pages/DoctorReportsPage"

export default function ClinicReportsRoute() {
  return (
    <div className="dashboard-page-wide min-h-0">
      <DashboardPageHeader
        compact
        eyebrow="Clinic"
        title="Administrative & Clinical Reports"
        subtitle="Doctor schedules, patient visits with arrival times, and appointment status reports."
      />
      <div className="dashboard-panel min-h-0 flex-1 !p-3 sm:!p-4">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading reports…</p>
          }
        >
          <DoctorReportsPage portal="clinic" />
        </Suspense>
      </div>
    </div>
  )
}
