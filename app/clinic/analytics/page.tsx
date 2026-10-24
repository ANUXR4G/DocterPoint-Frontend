"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorAnalyticsPage from "@/components/ui/doctors/pages/DoctorAnalyticsPage"

export default function ClinicAnalyticsRoute() {
  return (
    <div className="dashboard-page-wide h-full min-h-0 overflow-hidden !space-y-0 gap-3">
      <DashboardPageHeader
        compact
        className="shrink-0"
        eyebrow="Clinic"
        title={
          <>
            Doctors{" "}
            <span className="text-blue-600 dark:text-sky-400">analytics</span>
          </>
        }
        subtitle="Overview of every doctor, then drill into one doctor’s charts and visit mix."
      />
      <div className="dashboard-panel min-h-0 flex-1 overflow-hidden !p-3 sm:!p-4">
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
