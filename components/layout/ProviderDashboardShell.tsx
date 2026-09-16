"use client"

import AuthenticatedShell from "@/components/layout/AuthenticatedShell"
import { PracticeDashboardProvider } from "@/contexts/PracticeDashboardContext"

/** Doctor/clinic shell: load practice data once + live WS for all nested pages. */
export default function ProviderDashboardShell({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <AuthenticatedShell className={className}>
      <PracticeDashboardProvider>{children}</PracticeDashboardProvider>
    </AuthenticatedShell>
  )
}
