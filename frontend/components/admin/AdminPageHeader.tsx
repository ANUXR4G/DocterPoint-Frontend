"use client"

import type { ReactNode } from "react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"

type Props = {
  title: string
  subtitle?: string
  eyebrow?: string
  actions?: ReactNode
  backHref?: string | null
}

export default function AdminPageHeader({
  title,
  subtitle,
  eyebrow = "Platform admin",
  actions,
  backHref = "/admin/dashboard",
}: Props) {
  return (
    <DashboardPageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      backHref={backHref ?? undefined}
      backLabel="Control center"
      action={actions}
    />
  )
}
