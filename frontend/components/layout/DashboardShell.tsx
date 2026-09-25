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
      <div className="dashboard-app-canvas relative z-10 flex min-h-screen flex-col md:pl-[72px] xl:pl-60">
        {/* Floating top bar — no frame / border / fill */}
        <Header role={role} embedded />
        <main
          className={`dashboard-main flex-1 overflow-y-auto px-4 pb-8 pt-6 text-[var(--solune-ink)] xs:px-5 sm:pt-8 md:px-6 dark:text-slate-100 ${className}`}
        >
          {children}
        </main>
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
