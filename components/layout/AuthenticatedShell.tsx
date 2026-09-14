"use client"

import DashboardShell from "@/components/layout/DashboardShell"

/** Dashboard sidebar + header (with profile menu) for signed-in users. */
export default function AuthenticatedShell({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <DashboardShell className={className}>{children}</DashboardShell>
}
