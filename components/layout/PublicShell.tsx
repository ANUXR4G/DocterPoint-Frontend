"use client"

import Link from "next/link"
import SiteNavbar, { type SiteNavActive } from "@/components/layout/SiteNavbar"
import AuthenticatedShell from "@/components/layout/AuthenticatedShell"
import { useLoggedIn } from "@/hooks/useLoggedIn"

type PublicShellProps = {
  children: React.ReactNode
  active?: SiteNavActive
  /** Tighter auth layout — less padding, no footer (fits one screen). */
  compact?: boolean
}

function AuthenticatedPublicShell({ children }: { children: React.ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>
}

/** Public shell — sky canvas for guests; dashboard chrome when signed in. */
export default function PublicShell({
  children,
  active,
  compact = false,
}: PublicShellProps) {
  const loggedIn = useLoggedIn()

  if (loggedIn) {
    return <AuthenticatedPublicShell>{children}</AuthenticatedPublicShell>
  }

  return (
    <div className="dashboard-app min-h-[100dvh] overflow-x-clip antialiased">
      <div className="dashboard-app-canvas flex min-h-[100dvh] flex-col">
        <SiteNavbar active={active} />

        <main
          className={
            compact
              ? "mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 pb-4 pt-[4.25rem] sm:px-4"
              : "mx-auto w-full max-w-[1400px] flex-1 px-3 pb-8 pt-[4.25rem] sm:px-4 sm:pb-12"
          }
        >
          <div className="dashboard-frame min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-100/90 bg-white p-5 shadow-[0_24px_64px_-32px_rgba(37,99,235,0.22)] dark:border-white/10 dark:bg-slate-900 sm:p-8">
            {children}
          </div>
        </main>

        {!compact ? (
          <footer className="border-t border-sky-100 bg-sky-50/50 px-4 py-10 dark:border-white/10 dark:bg-slate-900/40 sm:px-8">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-sm">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2.5 text-lg font-bold text-slate-900 dark:text-white"
                >
                  <span className="relative flex size-8 items-center justify-center">
                    <span className="absolute left-0.5 top-1 size-3 rounded-full bg-sky-400" />
                    <span className="absolute bottom-1 right-0.5 size-3 rounded-full bg-blue-600" />
                  </span>
                  GlucoGuide
                </Link>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Find doctors & book clinic visits nearby.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  © {new Date().getFullYear()} GlucoGuide
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600 dark:text-slate-400">
                <Link href="/practices" className="hover:text-blue-600">
                  Find Care
                </Link>
                <Link href="/about" className="hover:text-blue-600">
                  About
                </Link>
                <Link href="/login/clinic" className="hover:text-blue-600">
                  Clinics
                </Link>
                <Link href="/login/doctor" className="hover:text-blue-600">
                  Doctors
                </Link>
                <Link href="/login/patient" className="hover:text-blue-600">
                  Patients
                </Link>
                <Link href="/privacy" className="hover:text-blue-600">
                  Privacy
                </Link>
                <Link href="/terms" className="hover:text-blue-600">
                  Terms
                </Link>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
