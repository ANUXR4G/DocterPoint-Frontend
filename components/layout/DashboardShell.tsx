"use client"

import React, { useEffect, Suspense } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"

import { useRole } from "@/hooks/useRole"
import { useAppContext } from "@/hooks/useAppContext"
import { userService } from "@/lib/services/user"
import Header from "@/components/ui/Header"
import ThemeBackground from "@/components/bg/ThemeBackground"
import { useDashboardBg } from "@/hooks/useDashboardBg"
import { isCustomImageBg } from "@/lib/themeBg"

const Sidebar = dynamic(() => import("../ui/Sidebar"), { ssr: false })
const Menu = dynamic(() => import("../ui/Menu"), { ssr: false })
const ChatModal = dynamic(() => import("../modals/ChatModal"), { ssr: false })

export default function DashboardShell({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  const role = useRole()
  const router = useRouter()
  const pathname = usePathname()
  const { showMenu, toggleHelp, showHelp, closeMenu } = useAppContext()
  const { resolvedBg } = useDashboardBg()
  const custom = isCustomImageBg(resolvedBg)

  async function handleLogout() {
    const response = await userService.logout()
    if (response.ok) {
      router.refresh()
      window.location.reload()
    }
  }

  useEffect(() => {
    closeMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div className="dashboard-app min-h-screen">
      {custom ? <ThemeBackground bgSrc={resolvedBg} /> : null}
      <Suspense fallback={null}>
        <Sidebar role={role} logout={handleLogout} />
      </Suspense>
      <div className="dashboard-app-canvas relative z-10 min-h-screen p-2 sm:p-3 md:pl-[calc(72px+0.75rem)] md:pr-3 md:pt-3 md:pb-3 xl:pl-[calc(240px+1rem)] xl:pr-4 xl:pt-4 xl:pb-4">
        <div className="dashboard-frame flex min-h-[calc(100vh-1rem)] w-full flex-col overflow-hidden rounded-[28px] border border-slate-100/90 bg-white shadow-[0_24px_64px_-32px_rgba(37,99,235,0.22)] dark:border-white/10 dark:bg-[#0f172a] sm:min-h-[calc(100vh-1.5rem)] md:min-h-[calc(100vh-1.5rem)]">
          <Header role={role} embedded />
          <main
            className={`dashboard-main flex-1 overflow-y-auto px-4 py-5 text-[var(--solune-ink)] xs:px-5 md:px-6 dark:text-slate-100 ${className}`}
          >
            {children}
          </main>
        </div>
      </div>
      <AnimatePresence>
        {showMenu && (
          <Suspense fallback={null}>
            <Menu role={role} logout={handleLogout} />
          </Suspense>
        )}
      </AnimatePresence>
      {showHelp && (
        <ChatModal isOpen={showHelp} toggleChat={toggleHelp} role={role} />
      )}
    </div>
  )
}
