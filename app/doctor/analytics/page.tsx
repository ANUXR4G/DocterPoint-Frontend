"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorAnalyticsPage from "@/components/ui/doctors/pages/DoctorAnalyticsPage"

export default function DoctorAnalyticsRoute() {
  return (
    <div className="dashboard-page-wide h-full min-h-0 overflow-hidden !space-y-0 gap-3">
      <DashboardPageHeader
        compact
        className="shrink-0"
        eyebrow="Doctor"
        title={
          <>
            Patient{" "}
            <span className="text-blue-600 dark:text-sky-400">analytics</span>
          </>
        }
        subtitle="Track patient visits by gender over time. Switch between weekly and monthly views."
      />
      <div className="dashboard-panel min-h-0 flex-1 overflow-hidden !p-3 sm:!p-4">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading analytics…</p>
          }
        >
          <DoctorAnalyticsPage portal="doctor" />
        </Suspense>
      </div>
    </div>
  )
}
