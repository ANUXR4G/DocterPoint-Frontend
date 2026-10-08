"use client"

import DoctorPatientsList from "@/components/ui/doctors/pages/DoctorPatientsList"

export default function DoctorPatientsPage() {
  return (
    <div className="dashboard-page-wide h-full min-h-0 overflow-hidden !space-y-0">
      <DoctorPatientsList />
    </div>
  )
}
