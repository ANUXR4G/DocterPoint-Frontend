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
        subtitle="Who added or removed slots, leave and blocks, walk-ins and desk registrations — and when"
      />
      <AuditLogPanel />
    </div>
  )
}
