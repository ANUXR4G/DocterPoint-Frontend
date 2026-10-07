"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useRole } from "@/hooks/useRole"
import { useUser } from "@/hooks/useUser"
import { CLINIC_ROLE_LABEL } from "@/lib/quickSlots"
import {
  dashboardBrandLabel,
  navRoleFromContext,
} from "@/lib/providerPortal"
import { withDrTitle } from "@/lib/doctorName"
import { cookies } from "@/utils/cookies"
import { proctoService } from "@/lib/services/procto"

type Membership = {
  role?: string
  practice?: {
    id?: string
    name?: string
    type?: string | null
  } | null
}

function portalRoleLabel(navRole: string | null | undefined): string {
  switch (navRole) {
    case "user":
      return "Patient"
    case "doctor":
      return "Doctor"
    case "clinic":
      return "Clinic"
    case "admin":
      return "Admin"
    default:
      return "User"
  }
}

function personName(data: unknown): string {
  if (!data || typeof data !== "object") return ""
  const o = data as Record<string, unknown>
  const name = String(o.name ?? o.fullName ?? "").trim()
  return name
}

/**
 * Top-left dashboard identity: clinic / doctor practice name + signed-in user and role.
 */
export default function DashboardIdentity() {
  const jwtRole = useRole()
  const pathname = usePathname()
  const navRole =
    navRoleFromContext(
      jwtRole,
      pathname ?? null,
      cookies.getCookie("gg_portal"),
    ) ?? jwtRole
  const { data: user } = useUser(jwtRole || "default")
  const [practiceName, setPracticeName] = useState<string | null>(null)
  const [membershipRole, setMembershipRole] = useState<string | null>(null)

  useEffect(() => {
    if (navRole !== "doctor" && navRole !== "clinic") {
      setPracticeName(null)
      setMembershipRole(null)
      return
    }
    let cancelled = false
    void proctoService.getMyPractices().then((res) => {
      if (cancelled) return
      if (res.status !== "successful" || !Array.isArray(res.data) || !res.data.length) {
        setPracticeName(null)
        setMembershipRole(null)
        return
      }
      const m = res.data[0] as Membership
      setPracticeName(m.practice?.name?.trim() || null)
      setMembershipRole(m.role?.trim() || null)
    })
    return () => {
      cancelled = true
    }
  }, [navRole])

  const rawName = personName(user)
  const displayUser =
    navRole === "doctor" || membershipRole === "DOCTOR"
      ? withDrTitle(rawName) || rawName
      : rawName

  const roleLabel =
    (membershipRole && CLINIC_ROLE_LABEL[membershipRole]) ||
    portalRoleLabel(navRole)

  const orgTitle =
    practiceName ||
    (navRole === "doctor" || navRole === "clinic"
      ? dashboardBrandLabel(navRole)
      : dashboardBrandLabel(navRole))

  return (
    <div className="min-w-0 flex-1 md:max-w-md">
      <p className="truncate text-sm font-bold leading-tight text-slate-900 dark:text-white">
        {orgTitle}
      </p>
      <p className="truncate text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">
        {[displayUser || null, roleLabel].filter(Boolean).join(" · ") ||
          roleLabel}
      </p>
    </div>
  )
}
