"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorAnalyticsPage from "@/components/ui/doctors/pages/DoctorAnalyticsPage"

export default function ClinicAnalyticsRoute() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Clinic"
        title={
          <>
            Doctors{" "}
            <span className="text-blue-600 dark:text-sky-400">analytics</span>
          </>
        }
        subtitle="Overview of every doctor, then drill into one doctor’s charts and visit mix."
      />
      <div className="dashboard-panel">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading analytics…</p>
          }
        >
          <DoctorAnalyticsPage
            portal="clinic"
            subscriptionHref="/clinic/subscription"
          />
        </Suspense>
      </div>
    </div>
  )
}
