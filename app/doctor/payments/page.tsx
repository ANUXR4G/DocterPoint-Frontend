"use client"

import PaymentsPage from "@/components/ui/procto/PaymentsPage"

export default function DoctorPaymentsPage() {
  return (
    <div className="dashboard-page-wide">
      <PaymentsPage portal="doctor" />
    </div>
  )
}
