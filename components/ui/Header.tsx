"use client"

import { useAppContext } from "@/hooks/useAppContext"
import { ProfileMenu, Icon } from "@/components"
import { motion, useMotionValueEvent, useScroll } from "framer-motion"
import React, { useState } from "react"
import { visibleAnimation } from "@/lib/animations"
import { useUser } from "@/hooks/useUser"

type Props = {
  role?: string | null
}

export default function Header({ role }: Props) {
  const [hidden, setHidden] = useState<boolean>(false)
  const [showProfileMenu, setShowProfileMenu] = useState<boolean>(false)

  const { scrollY } = useScroll()
  const { showMenu, toggleMenu } = useAppContext()

  const { data } = useUser(role || "default")

  // Track the scrolling position to show the header
  useMotionValueEvent(scrollY, "change", (latest) => {
    const prev = scrollY.getPrevious()

    if (prev && latest > prev && latest > 150) {
      if (showProfileMenu) {
        setShowProfileMenu(false)
      }
      setHidden(true)
    } else {
      setHidden(false)
    }
  })

  // Toggle profile menu modal
  const closeProfileMenu = () => setShowProfileMenu(false)
  const toggleProfileMenu = () => setShowProfileMenu((prev) => !prev)

  return (
    <motion.div
      variants={visibleAnimation}
      animate={hidden ? "hidden" : "visible"}
      className={`ml-auto w-full xl:w-[calc(100%-240px)] sticky top-0 min-h-16 flex items-center justify-between bg-[--primary-white]/100 px-3 xs:px-4 z-30 dark:bg-zinc-900/60 backdrop-blur-lg`}
    >
      {/* Hamburger menu */}
      <div
        className={`w-8 h-3 relative rounded-sm hover:cursor-pointer before:absolute before:content-[''] before:w-full before:h-[3px] before:bg-[--secondary-black] dark:before:bg-neutral-400 before:top-[1px] after:absolute after:content-[''] after:w-2/3 after:h-[3px] after:bg-[--secondary-black] dark:after:bg-neutral-400 after:rounded-sm before:rounded-sm after:bottom-0 before:ease-in-out before:duration-300 after:ease-in-out after:duration-300 after:delay-75 md:hidden ${
          showMenu
            ? `before:translate-x-3 after:translate-x-2 before:opacity-0 after:opacity-0`
            : `after:translate-x-0 before:translate-x-0 before:opacity-1 after:opacity-1`
        }`}
        onClick={toggleMenu}
      />

      {/* Header controls */}
      <div className="center gap-x-3 md:w-full md:justify-end">
        <React.Fragment>
          {/* Search control */}
          <div className="w-9 h-9 center rounded-full hover:cursor-pointer">
            <Icon
              name="search"
              className="h-7 w-7 opacity-95"
              pathClassName="dark:stroke-neutral-400"
            />
          </div>

          {/* Notification control */}
          <div className="w-9 h-9 center rounded-full hover:cursor-pointer">
            <Icon
              name="bell"
              className="h-7 w-7"
              pathClassName="dark:stroke-neutral-400"
            />
          </div>

          {/* Profile Menu */}
          <ProfileMenu
            data={data}
            open={showProfileMenu}
            toggleModal={toggleProfileMenu}
            closeModal={closeProfileMenu}
          />
        </React.Fragment>
      </div>
    </motion.div>
  )
}
