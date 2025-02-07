"use client"

import React, { useEffect } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"

import { useRole } from "@/hooks/useRole"
import { useAppContext } from "@/hooks/useAppContext"

import { userService } from "@/lib/services/user"
import { ChatModal, Header, Menu } from "@/components"

const Sidebar = dynamic(() => import("../../components/ui/Sidebar"), {
  ssr: false,
})

export default function Navigation() {
  const role = useRole()
  const router = useRouter()
  const pathname = usePathname()

  const { showMenu, toggleHelp, showHelp, closeMenu } = useAppContext()

  // Handle user session logout
  async function handleLogout() {
    const response = await userService.logout()
    if (response.ok) {
      router.refresh()
      window.location.reload()
    }
  }

  // Close menu on route change
  useEffect(() => {
    closeMenu()
    //eslint-disable-next-line
  }, [pathname])

  return (
    <React.Fragment>
      <Header role={role} />
      <AnimatePresence>
        {showMenu && <Menu role={role} logout={handleLogout} />}
      </AnimatePresence>
      <Sidebar role={role} logout={handleLogout} />
      {showHelp && (
        <ChatModal isOpen={showHelp} toggleChat={toggleHelp} role={role} />
      )}
    </React.Fragment>
  )
}
