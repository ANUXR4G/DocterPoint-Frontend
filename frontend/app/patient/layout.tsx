"use client"

import React from "react"
import PatientDashboardShell from "@/components/layout/PatientDashboardShell"

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PatientDashboardShell>{children}</PatientDashboardShell>
}
