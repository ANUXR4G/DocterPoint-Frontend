"use client"

import Link from "next/link"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import DoctorPatientsList from "@/components/ui/doctors/pages/DoctorPatientsList"

export default function DoctorPatientsPage() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        compact
        eyebrow="Doctor"
        title="Patients"
        subtitle="Everyone who booked with your clinic — search, filter, and open visit history"
        action={
          <Link
            href="/doctor/appointments"
            className="inline-flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            Appointments
          </Link>
        }
      />
      <DoctorPatientsList />
    </div>
  )
}
