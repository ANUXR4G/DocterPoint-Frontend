"use client"

import React from "react"
import AuthenticatedShell from "@/components/layout/AuthenticatedShell"

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>
}
