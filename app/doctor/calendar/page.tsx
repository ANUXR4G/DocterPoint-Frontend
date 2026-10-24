"use client"

import { Suspense } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import AppointmentCalendar from "@/components/ui/doctors/appointments/AppointmentCalendar"

export default function DoctorCalendarPage() {
  return (
    <div className="dashboard-page-wide h-full min-h-0 overflow-hidden !space-y-0 gap-3">
      <DashboardPageHeader
        compact
        className="shrink-0"
        eyebrow="Doctor"
        title="Calendar"
        subtitle="Day, week, and month views of clinic bookings — filter by doctor or see the whole practice."
      />
      <div className="dashboard-panel min-h-0 flex-1 overflow-hidden !p-3 sm:!p-4">
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
