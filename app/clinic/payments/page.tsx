"use client"

import PaymentsPage from "@/components/ui/procto/PaymentsPage"

export default function ClinicPaymentsPage() {
  return (
    <div className="dashboard-page-wide">
      <PaymentsPage portal="clinic" />
    </div>
  )
}
