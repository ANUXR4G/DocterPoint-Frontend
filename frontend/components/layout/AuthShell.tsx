"use client"

import Link from "next/link"
import SiteNavbar, { type SiteNavActive } from "@/components/layout/SiteNavbar"

type AuthShellProps = {
  children: React.ReactNode
  active?: SiteNavActive
}

/** Login / register layout — matches home page sky-blue palette (no dashboard chrome). */
export default function AuthShell({
  children,
  active = "login",
}: AuthShellProps) {
  return (
    <div className="gg-auth flex min-h-[100dvh] flex-col overflow-x-clip bg-gradient-to-b from-sky-50/90 via-white to-white text-slate-900 antialiased dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <SiteNavbar active={active} />

      <main className="mx-auto flex w-full max-w-[1199px] flex-1 flex-col px-4 pt-24 pb-8 sm:px-6 sm:pt-28 sm:pb-10">
        {children}
      </main>

      <footer className="shrink-0 border-t border-sky-100/80 bg-white/60 px-4 py-6 text-center text-xs text-slate-500 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400 sm:px-6">
        <p>
          © {new Date().getFullYear()} GlucoGuide ·{" "}
          <Link href="/privacy" className="font-medium text-blue-600 hover:underline dark:text-sky-400">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="font-medium text-blue-600 hover:underline dark:text-sky-400">
            Terms
          </Link>
        </p>
      </footer>
    </div>
  )
}
