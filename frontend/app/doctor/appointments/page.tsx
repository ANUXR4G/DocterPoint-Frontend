"use client"

import DoctorAppointmentsList from "@/components/ui/doctors/pages/DoctorAppointmentsList"

export default function DoctorAppointmentsPage() {
  return (
    <div className="dashboard-page-wide h-full min-h-0 overflow-hidden !space-y-0">
      <DoctorAppointmentsList />
    </div>
  )
}
