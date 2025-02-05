"use client"

import { DoctorSidebar, DoctorHeader, DoctorMenu } from "@/components"
import { AnimatePresence } from "framer-motion"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAppContext } from "@/hooks/useAppContext"

export default function Navigation() {
  const { showMenu, showChat, closeMenu } = useAppContext()

  let pathname = usePathname()

  // close menu on route change
  useEffect(() => {
    closeMenu()
    //eslint-disable-next-line
  }, [pathname])

  return (
    <>
      <DoctorHeader />
      <AnimatePresence>{showMenu && <DoctorMenu />}</AnimatePresence>
      <DoctorSidebar />
      {/* {showChat && <ChatModal />} */}
    </>
  )
}
