"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { practiceTabHref, DOCTOR_PATIENTS_HREF } from "@/lib/doctorPracticeTabs"

const LINKS = [
  { href: "/clinic/dashboard", label: "Dashboard" },
  { href: "/doctor/activity", label: "Activity" },
  { href: "/doctor/queue", label: "Queue" },
  { href: "/doctor/notifications", label: "Notifications" },
  { href: "/doctor/appointments", label: "Appointments" },
  { href: DOCTOR_PATIENTS_HREF, label: "Patients" },
  { href: "/doctor/calendar", label: "Calendar" },
  { href: "/doctor/analytics", label: "Analytics" },
  { href: practiceTabHref("setup"), label: "Hours & blocks" },
  { href: practiceTabHref("doctors"), label: "Doctors" },
  { href: "/clinic/subscription", label: "Subscription" },
] as const

function pathOnly(href: string): string {
  return href.split("?")[0]?.split("#")[0] ?? href
}

export function isClinicNavActive(
  pathname: string,
  dest?: string | null,
  currentTab?: string | null,
  currentSubtab?: string | null,
): boolean {
  if (!dest || dest === "#") return false
  const destPath = pathOnly(dest)
  const destUrl = new URL(dest, "http://local")
  const destTab = destUrl.searchParams.get("tab")
  const destSub = destUrl.searchParams.get("subtab")

  if (destPath === "/settings" && destTab === "practice") {
    if (pathname !== "/settings" || currentTab !== "practice") return false
    if (destSub) return currentSubtab === destSub
    return true
  }

  if (destPath === "/clinic/dashboard") {
    return pathname === "/clinic/dashboard"
  }

  if (destPath === "/clinic/subscription") {
    return pathname === "/clinic/subscription"
  }

  if (destPath === "/doctor/analytics") {
    return pathname === "/doctor/analytics"
  }

  if (destPath === "/doctor/calendar") {
    return pathname === "/doctor/calendar"
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

  if (destPath === "/doctor/appointments") {
    return (
      pathname === "/doctor/appointments" ||
      pathname.startsWith("/doctor/appointments/")
    )
  }

  if (pathname === destPath) return true
  if (destPath !== "/" && pathname.startsWith(`${destPath}/`)) return true
  return false
}

export default function ClinicPortalLinks({
  exclude,
}: {
  exclude?: string[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const currentSubtab = searchParams.get("subtab")
  const items = LINKS.filter((l) => !exclude?.includes(l.href))

  return (
    <nav
      aria-label="Clinic portal"
      className="mb-4 flex flex-wrap gap-2 text-sm"
    >
      {items.map((l) => {
        const active = isClinicNavActive(
          pathname,
          l.href,
          currentTab,
          currentSubtab,
        )
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
