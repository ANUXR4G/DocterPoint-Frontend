"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorQueue from "@/components/ui/doctors/pages/DoctorQueue"

export default function DoctorQueuePage() {
  return (
    <div className="dashboard-page-wide flex h-[calc(100dvh-5.5rem)] flex-col">
      <DashboardPageHeader
        compact
        eyebrow="Doctor"
        title="Today's queue"
        subtitle="Today's clinic bookings — name, number, age, status updates, and quick actions."
      />
      <div className="dashboard-panel min-h-0 flex-1 !p-3 sm:!p-4">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading queue…</p>
          }
        >
          <DoctorQueue showFilters allowStatusControl />
        </Suspense>
      </div>
    </div>
  )
}
