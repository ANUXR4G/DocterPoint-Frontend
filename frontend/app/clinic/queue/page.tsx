"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorQueue from "@/components/ui/doctors/pages/DoctorQueue"

function ClinicQueueInner() {
  const searchParams = useSearchParams()
  const doctor = searchParams.get("doctor") || ""

  return (
    <DoctorQueue
      showFilters
      allowStatusControl
      initialProviderId={doctor}
    />
  )
}

export default function ClinicQueuePage() {
  return (
    <div className="dashboard-page-wide flex h-[calc(100dvh-5.5rem)] flex-col">
      <DashboardPageHeader
        compact
        eyebrow="Clinic"
        title="Today's queue"
        subtitle="Filter by doctor and update waiting / in progress / completed / no-show for any patient."
      />
      <div className="dashboard-panel min-h-0 flex-1 !p-3 sm:!p-4">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading queue…</p>
          }
        >
          <ClinicQueueInner />
        </Suspense>
      </div>
    </div>
  )
}
