"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

const LINKS = [
  { href: "/doctor/dashboard", label: "Dashboard" },
  { href: "/doctor/queue", label: "Queue" },
  { href: "/doctor/notifications", label: "Notifications" },
  { href: "/doctor/appointments", label: "Appointments" },
  { href: "/doctor/patients", label: "Patients" },
  { href: "/doctor/activity", label: "Support" },
  { href: "/doctor/calendar", label: "Calendar" },
  { href: "/doctor/analytics", label: "Analytics" },
  { href: "/doctor/subscription", label: "Subscription" },
] as const

function pathOnly(href: string): string {
  return href.split("?")[0]?.split("#")[0] ?? href
}

/** Shared cross-links for doctor clinic pages */
export default function DoctorPortalLinks({
  exclude,
}: {
  exclude?: string[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const items = LINKS.filter((l) => !exclude?.includes(l.href))

  return (
    <nav
      aria-label="Doctor portal"
      className="mb-4 flex flex-wrap gap-2 text-sm"
    >
      {items.map((l) => {
        const active = isDoctorNavActive(pathname, l.href, currentTab)
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Sidebar / menu active state for nested routes (e.g. /doctor/queue/[id]). */
export function isDoctorNavActive(
  pathname: string,
  dest?: string | null,
  _currentTab?: string | null,
): boolean {
  if (!dest || dest === "#") return false
  const destPath = pathOnly(dest)

  // Dashboard is only the home page — never steal active from Queue visits.
  if (destPath === "/doctor/dashboard") {
    return pathname === "/doctor/dashboard"
  }

  if (destPath === "/doctor/queue") {
    return (
      pathname === "/doctor/queue" || pathname.startsWith("/doctor/queue/")
    )
  }

  if (destPath === "/doctor/notifications") {
    return pathname === "/doctor/notifications"
  }

  if (destPath === "/doctor/activity") {
    return pathname === "/doctor/activity"
  }

  if (destPath === "/doctor/analytics") {
    return pathname === "/doctor/analytics"
  }

  if (destPath === "/doctor/calendar") {
    return pathname === "/doctor/calendar"
  }

  if (destPath === "/doctor/appointments") {
    return (
      pathname === "/doctor/appointments" ||
      pathname.startsWith("/doctor/appointments/")
    )
  }

  if (destPath === "/doctor/patients") {
    return (
      pathname === "/doctor/patients" ||
      pathname.startsWith("/doctor/patients/")
    )
  }

  if (destPath === "/doctor/subscription") {
    return pathname === "/doctor/subscription"
  }

  if (pathname === destPath) return true
  if (destPath !== "/" && pathname.startsWith(`${destPath}/`)) return true
  return false
}
