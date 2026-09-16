"use client"

import React from "react"
import ProviderDashboardShell from "@/components/layout/ProviderDashboardShell"

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProviderDashboardShell>{children}</ProviderDashboardShell>
}
