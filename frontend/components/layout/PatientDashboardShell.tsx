"use client"

import AuthenticatedShell from "@/components/layout/AuthenticatedShell"
import { PatientDashboardProvider } from "@/contexts/PatientDashboardContext"

export default function PatientDashboardShell({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <AuthenticatedShell className={className}>
      <PatientDashboardProvider>{children}</PatientDashboardProvider>
    </AuthenticatedShell>
  )
}
