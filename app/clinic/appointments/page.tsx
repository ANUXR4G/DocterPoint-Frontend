"use client"

import DoctorAppointmentsList from "@/components/ui/doctors/pages/DoctorAppointmentsList"

export default function ClinicAppointmentsPage() {
  return (
    <div className="dashboard-page-wide">
      <DoctorAppointmentsList portal="clinic" />
    </div>
  )
}
