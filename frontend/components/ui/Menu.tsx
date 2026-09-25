"use client"

import Link from "next/link"

import { useRef } from "react"
import { motion } from "framer-motion"

import { fadingAnimation, slideInAnimation } from "@/lib/animations"
import { routes } from "@/lib/dummy/routes"

import { Background, Icon } from "@/components"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useClickOutside } from "@/hooks/useClickOutside"
import { useAppContext } from "@/hooks/useAppContext"
import { useClinicAdmin } from "@/hooks/useClinicAdmin"
import { isDoctorNavActive } from "@/components/ui/doctors/DoctorPortalLinks"
import { isClinicNavActive } from "@/components/ui/clinics/ClinicPortalLinks"
import { isAdminNavActive } from "@/components/ui/admin/AdminPortalLinks"
import { cookies } from "@/utils/cookies"
import { navRoleFromContext, dashboardBrandLabel } from "@/lib/providerPortal"
import { useAdminSupportUnread } from "@/hooks/useAdminSupportUnread"

type Props = {
  role: string | null
  logout: () => Promise<void>
}

function splitNav(
  role: string | null,
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
    "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200",
    active
      ? "bg-sky-100 text-slate-900 shadow-sm dark:bg-blue-500/20 dark:text-white"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
  ].join(" ")
}

export default function Menu({ role, logout }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const currentSubtab = searchParams.get("subtab")
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

  const router = useRouter()

  useClickOutside(containerRef, () => closeMenu())

  return (
    <>
      <motion.nav
        variants={slideInAnimation}
        initial="initial"
        animate="animate"
        exit="exit"
        ref={containerRef}
        className="fixed left-0 top-0 z-[70] flex h-full min-h-full w-60 flex-col border-r border-slate-100 bg-sky-50/98 pt-5 backdrop-blur-sm prevent-scroll md:hidden dark:border-white/10 dark:bg-[#0f172a] dark:backdrop-blur-none"
      >
        <Background name="half-box-pattern" className="hidden opacity-10 dark:block" />

        <div className="mb-5 flex items-center gap-2.5 px-4">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-blue-600 text-white dark:bg-blue-500">
            <Icon className="h-5 w-5" name="gluco-guide" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.3px] text-slate-900 dark:text-white">
              GlucoGuide
            </h3>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-500">
              {dashboardBrandLabel(navRole)}
            </p>
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden px-3 pb-4">
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto custom-scroll">
            <span className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">
              Overview
            </span>
            {overview.map(({ name, icon, dest }, idx) => {
              const active = navActiveFn(pathname, dest, currentTab)
              return (
                <Link
                  href={dest ?? "#"}
                  onClick={() => closeMenu()}
                  className={navLinkClass(active)}
                  key={`menu_upper_link_${idx}`}
                >
                  <Icon
                    name={icon}
                    className="size-5 shrink-0"
                    pathClassName={
                      active
                        ? "stroke-slate-900 dark:stroke-white"
                        : "stroke-slate-400 dark:stroke-slate-500"
                    }
                  />
                  <span className="text-[13px] font-semibold tracking-[-0.1px]">
                    {name}
                  </span>
                </Link>
              )
            })}
          </div>

          <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-slate-100 pt-3 dark:border-white/10">
            <span className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">
              Support
            </span>
            {support.map(({ name, icon, dest }, idx) => {
              const isLogout = name === "Logout"
              const isHelp = name === "Help"
              const isActive = navActiveFn(pathname, dest, currentTab)
              const badge =
                name === "Support" && supportUnread > 0 ? supportUnread : 0

              return (
                <button
                  key={`menu_bottom_link_${idx}`}
                  type="button"
                  className={`${navLinkClass(isActive)} ${isLogout ? "mt-3" : ""}`}
                  onClick={async () => {
                    if (isLogout) {
                      await logout()
                      closeMenu()
                    } else if (isHelp) {
                      handleHelpModal()
                    } else if (dest) {
                      router.push(dest)
                      closeMenu()
                    }
                  }}
                >
                  <div className="relative shrink-0">
                    <Icon
                      className="size-5"
                      pathClassName={
                        isActive
                          ? "stroke-slate-900 dark:stroke-white"
                          : "stroke-slate-400 dark:stroke-slate-500"
                      }
                      name={icon}
                    />
                    {badge > 0 ? (
                      <span className="absolute -right-2 -top-2 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="flex flex-1 items-center gap-2 text-[13px] font-semibold tracking-[-0.1px]">
                    <span>{name}</span>
                    {badge > 0 ? (
                      <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </motion.nav>

      <motion.div
        className="fixed inset-0 z-50 size-full bg-black/80 backdrop-blur-sm"
        variants={fadingAnimation}
        initial="initial"
        animate="animate"
        exit="exit"
      />
    </>
  )
}
