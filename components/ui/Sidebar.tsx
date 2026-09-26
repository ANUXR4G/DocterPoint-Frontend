"use client"

import Link from "next/link"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Icon, Background } from "@/components"
import { routes } from "@/lib/dummy/routes"
import { useAppContext } from "@/hooks/useAppContext"
import { useClinicAdmin } from "@/hooks/useClinicAdmin"
import { isDoctorNavActive } from "@/components/ui/doctors/DoctorPortalLinks"
import { isClinicNavActive } from "@/components/ui/clinics/ClinicPortalLinks"
import { isAdminNavActive } from "@/components/ui/admin/AdminPortalLinks"
import { cookies } from "@/utils/cookies"
import { navRoleFromContext, dashboardBrandLabel } from "@/lib/providerPortal"
import { useAdminSupportUnread } from "@/hooks/useAdminSupportUnread"
import { usePracticeOpenNotifications } from "@/hooks/usePracticeOpenNotifications"

type Props = {
  role?: string | null
  logout: () => Promise<void>
  /** @deprecated Sidebar is always fixed; kept for call-site compatibility */
  embedded?: boolean
}

function splitNav(
  role: string | null | undefined,
  opts: { hideDoctorsNav: boolean },
) {
  const content = role && role in routes ? routes[role] : []
  const filtered = opts.hideDoctorsNav
    ? content.filter((r) => r.name !== "Doctors")
    : content
  const supportStart = filtered.findIndex((r) => r.name === "Settings")
  const splitAt = supportStart >= 0 ? supportStart : filtered.length
  return {
    overview: filtered.slice(0, splitAt),
    support: filtered.slice(splitAt),
  }
}

function navLinkClass(active: boolean) {
  return [
    "relative flex w-full items-center rounded-2xl px-2 py-1 transition-all duration-200 xl:px-3",
    active
      ? "bg-sky-100 text-slate-900 shadow-sm dark:bg-blue-500/20 dark:text-white"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
  ].join(" ")
}

export default function Sidebar({ role, logout }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const currentSubtab = searchParams.get("subtab")
  const router = useRouter()
  const { closeMenu, toggleHelp } = useAppContext()
  const { loading: clinicLoading, isClinicAdmin, hasPractice } =
    useClinicAdmin()

  const navRole =
    navRoleFromContext(role, pathname ?? null, cookies.getCookie("gg_portal")) ??
    role
  const navActiveFn =
    navRole === "admin"
      ? (path: string, dest?: string | null) => isAdminNavActive(path, dest)
      : navRole === "clinic"
        ? (
            path: string,
            dest?: string | null,
            tab?: string | null,
          ) => isClinicNavActive(path, dest, tab, currentSubtab)
        : isDoctorNavActive

  const hideDoctorsNav =
    navRole === "doctor" &&
    !clinicLoading &&
    hasPractice &&
    !isClinicAdmin

  function handleHelpModal() {
    closeMenu()
    toggleHelp()
  }

  const { overview, support } = splitNav(navRole, { hideDoctorsNav })
  const { unreadTotal: supportUnread } = useAdminSupportUnread(navRole === "admin")
  const { openCount: notificationOpen } = usePracticeOpenNotifications(
    navRole === "doctor" || navRole === "clinic",
  )

  function navBadgeCount(name: string) {
    if (name === "Support" && supportUnread > 0) return supportUnread
    if (name === "Notifications" && notificationOpen > 0) return notificationOpen
    return 0
  }

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[72px] flex-col border-r border-slate-100/60 bg-sky-50/95 backdrop-blur-sm md:flex xl:w-60 xl:px-3 xl:pt-5 dark:border-white/5 dark:bg-[#0f172a] dark:backdrop-blur-none">
      <Background name="half-box-pattern" className="pointer-events-none absolute inset-0 hidden opacity-[0.04] dark:xl:block" />
      <div className="relative z-[1] mb-5 hidden items-center gap-2.5 px-2 xl:flex">
        <div className="flex size-9 items-center justify-center rounded-2xl bg-blue-600 text-white dark:bg-blue-500">
          <Icon className="h-5 w-5" name="gluco-guide" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.3px] text-slate-900 dark:text-white">
            GlucoGuide
          </h3>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
            {dashboardBrandLabel(navRole)}
          </p>
        </div>
      </div>

      <div className="relative z-[1] flex h-full min-h-0 w-full flex-col overflow-hidden py-4">
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto no-scrollbar xl:gap-1 xl:show-scrollbar xl:custom-scroll">
          <span className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400 xl:block">
            Overview
          </span>
          {overview.map(({ name, icon, dest }, idx) => {
            const active = navActiveFn(pathname, dest, currentTab)
            const badge = navBadgeCount(name)
            return (
              <Link
                href={dest ?? "#"}
                className={navLinkClass(active)}
                key={`sidebar_upper_link_${idx}`}
              >
                <div className="relative flex size-12 shrink-0 items-center justify-center xl:size-10">
                  <Icon
                    name={icon}
                    pathClassName={`transition duration-200 ${
                      active
                        ? "stroke-slate-900 dark:stroke-white"
                        : "stroke-slate-400 dark:stroke-slate-500"
                    }`}
                  />
                  {/* Collapsed rail: badge on icon. Expanded xl: badge beside label only. */}
                  {badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white xl:hidden">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </div>
                <span className="hidden flex-1 items-center gap-2 text-[13px] font-semibold tracking-[-0.1px] xl:flex">
                  <span>{name}</span>
                  {badge > 0 ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="mt-3 flex shrink-0 flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-white/10 xl:mt-4">
          <span className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400 xl:block">
            Support
          </span>
          {support.map(({ name, icon, dest }, idx) => {
            const isLogout = name === "Logout"
            const isHelp = name === "Help"
            const isActive = navActiveFn(pathname, dest, currentTab)
            const badge = navBadgeCount(name)

            return (
              <button
                className={`${navLinkClass(isActive)} ${
                  isLogout ? "xl:mb-2 xl:mt-4" : ""
                }`}
                key={`sidebar_bottom_link_${idx}`}
                type="button"
                onClick={async () => {
                  if (isLogout) {
                    await logout()
                    closeMenu()
                  } else if (isHelp) {
                    handleHelpModal()
                  } else if (dest) {
                    router.push(dest)
                  }
                }}
              >
                <div className="relative flex size-12 shrink-0 items-center justify-center xl:size-10">
                  <Icon
                    name={icon}
                    pathClassName={
                      isActive
                        ? "stroke-slate-900 dark:stroke-white"
                        : "stroke-slate-400 dark:stroke-slate-500"
                    }
                  />
                  {badge > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white xl:hidden">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </div>
                <span className="hidden flex-1 items-center gap-2 text-[13px] font-semibold tracking-[-0.1px] xl:flex">
                  <span>{name}</span>
                  {badge > 0 ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
