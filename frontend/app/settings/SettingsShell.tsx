"use client"

import AuthenticatedShell from "@/components/layout/AuthenticatedShell"

export default function SettingsShell({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>
}
