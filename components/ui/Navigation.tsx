"use client"

import { Menu, Header, Sidebar, CoolKid, Modal } from "@/components"
import { AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useAppContext } from "@/hooks/useAppContext"
import { useProfile } from "@/hooks/useProfile"

export default function Navigation() {
  const { showMenu, closeMenu } = useAppContext()
  const { data } = useProfile()

  const [shouldAllow, setShouldAllow] = useState<boolean>(!!data?.name)

  let pathname = usePathname()

  // close menu on route change
  useEffect(() => {
    closeMenu()
    //eslint-disable-next-line
  }, [pathname])

  return (
    <>
      <Header />
      <AnimatePresence>{showMenu && <Menu />}</AnimatePresence>
      <Sidebar />
      {/* <Modal open={!shouldAllow} /> */}
    </>
  )
}
