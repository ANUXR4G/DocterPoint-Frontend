"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import AppointmentCalendar from "@/components/ui/doctors/appointments/AppointmentCalendar"

export default function DoctorCalendarPage() {
  return (
    <div className="dashboard-page-wide flex h-[calc(100dvh-5.5rem)] flex-col">
      <DashboardPageHeader
        compact
        eyebrow="Doctor"
        title="Calendar"
        subtitle="Day, week, and month views of clinic bookings — filter by doctor or see the whole practice."
      />
      <div className="dashboard-panel min-h-0 flex-1 !p-3 sm:!p-4">
        <Suspense
          fallback={
            <p className="text-sm text-slate-500">Loading calendar…</p>
          }
        >
          <AppointmentCalendar />
        </Suspense>
      </div>
    </div>
  )
}
