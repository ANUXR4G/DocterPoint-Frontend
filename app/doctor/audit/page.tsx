"use client"

import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import AuditLogPanel from "@/components/ui/procto/AuditLogPanel"

export default function DoctorAuditPage() {
  return (
    <div className="dashboard-page-wide">
      <DashboardPageHeader
        compact
        eyebrow="Practice"
        title="Audit log"
        subtitle="Appointments, schedule and blocks, prescriptions and documents, branding changes — who did what, and when"
      />
      <AuditLogPanel />
    </div>
  )
}
