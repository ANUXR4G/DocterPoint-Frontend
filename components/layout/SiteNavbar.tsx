"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCalendarEvent } from "@tabler/icons-react"
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "@/components/ui/resizable-navbar"
import { ModeToggle } from "@/components/ui/mode-toggle"
import UserProfileControls from "@/components/menu/UserProfileControls"
import { useLoggedIn } from "@/hooks/useLoggedIn"
import { useRole } from "@/hooks/useRole"
import { cookies } from "@/utils/cookies"
import { providerDashboardFromContext } from "@/lib/providerPortal"

export type SiteNavActive =
  | "home"
  | "find"
  | "login"
  | "about"
  | "clinics"
  | "doctors"

const navItems = [
  { name: "Find doctors", link: "/practices" },
  { name: "For Clinics", link: "/login/clinic" },
  { name: "About", link: "/about" },
  { name: "Doctors", link: "/login/doctor" },
]

type SiteNavbarProps = {
  active?: SiteNavActive
  overDark?: boolean
  scrollYOverride?: number
  ready?: boolean
}

function dashboardHref(
  role: string | null,
  pathname: string | null,
): string {
  return providerDashboardFromContext(
    role,
    pathname,
    cookies.getCookie("gg_portal"),
  )
}

/** Top-nav with shadcn mode toggle (light / dark / system). */
export default function SiteNavbar({
  scrollYOverride,
  ready = true,
}: SiteNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const loggedIn = useLoggedIn()
  const role = useRole()
  const pathname = usePathname()

  if (!ready) return null

  return (
    <Navbar scrollYOverride={scrollYOverride}>
      <NavBody>
        <NavbarLogo />
        <NavItems items={navItems} />
        <div className="relative z-50 flex shrink-0 items-center gap-2">
          <ModeToggle className="border-slate-200 bg-white/80 shadow-sm dark:border-white/15 dark:bg-slate-800/80" />
          {loggedIn ? (
            <>
              <NavbarButton href={dashboardHref(role, pathname)} variant="secondary">
                Dashboard
              </NavbarButton>
              <UserProfileControls />
            </>
          ) : (
            <>
              <NavbarButton href="/login/patient" variant="secondary">
                Patient login
              </NavbarButton>
              <NavbarButton href="/practices" variant="primary">
                Book now
              </NavbarButton>
            </>
          )}
        </div>
      </NavBody>

      <MobileNav>
        <MobileNavHeader>
          <NavbarLogo />
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 xs:gap-2">
            <ModeToggle className="border-slate-200 bg-white/80 shadow-sm dark:border-white/15 dark:bg-slate-800/80" />
            {loggedIn ? (
              <UserProfileControls />
            ) : (
              <>
                <NavbarButton
                  href="/practices"
                  variant="primary"
                  aria-label="Book now"
                  className="inline-flex size-9 shrink-0 items-center justify-center !px-0 xs:hidden"
                >
                  <IconCalendarEvent className="size-4" stroke={2} />
                </NavbarButton>
                <NavbarButton
                  href="/practices"
                  variant="primary"
                  className="hidden shrink-0 xs:inline-block"
                >
                  Book now
                </NavbarButton>
              </>
            )}
            <MobileNavToggle
              isOpen={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            />
          </div>
        </MobileNavHeader>
        <MobileNavMenu
          isOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        >
          {navItems.map((item) => (
            <Link
              key={item.link + item.name}
              href={item.link}
              onClick={() => setMobileOpen(false)}
              className="text-[15px] font-medium tracking-[-0.15px] text-neutral-600 hover:text-neutral-900 dark:text-[#999999] dark:hover:text-white"
            >
              {item.name}
            </Link>
          ))}
          {loggedIn ? (
            <Link
              href={dashboardHref(role, pathname)}
              onClick={() => setMobileOpen(false)}
              className="text-[15px] font-medium tracking-[-0.15px] text-neutral-600 hover:text-neutral-900 dark:text-[#999999] dark:hover:text-white"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login/patient"
              onClick={() => setMobileOpen(false)}
              className="text-[15px] font-medium tracking-[-0.15px] text-neutral-600 hover:text-neutral-900 dark:text-[#999999] dark:hover:text-white"
            >
              Patient login
            </Link>
          )}
          {!loggedIn ? (
            <NavbarButton
              href="/practices"
              onClick={() => setMobileOpen(false)}
              variant="primary"
              className="w-full"
            >
              Book now
            </NavbarButton>
          ) : null}
          <div className="flex w-full items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-white/10">
            <span className="text-[15px] font-medium tracking-[-0.15px] text-neutral-600 dark:text-[#999999]">
              Theme
            </span>
            <ModeToggle className="border-slate-200 bg-white shadow-sm dark:border-white/15 dark:bg-slate-800" />
          </div>
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  )
}

export const SITE_NAV = navItems
