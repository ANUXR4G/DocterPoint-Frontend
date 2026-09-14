"use client"

import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorAnalyticsPage from "@/components/ui/doctors/pages/DoctorAnalyticsPage"

export default function DoctorAnalyticsRoute() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        eyebrow="Doctor"
        title={
          <>
            Patient{" "}
            <span className="text-blue-600 dark:text-sky-400">analytics</span>
          </>
        }
        subtitle="Track patient visits by gender over time. Switch between weekly and monthly views."
      />
      <div className="dashboard-panel">
        <DoctorAnalyticsPage />
      </div>
    </div>
  )
}
