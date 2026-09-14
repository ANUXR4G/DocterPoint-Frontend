"use client"

import { useAppContext } from "@/hooks/useAppContext"
import { Icon } from "@/components"
import UserProfileControls from "@/components/menu/UserProfileControls"
import { ModeToggle } from "@/components/ui/mode-toggle"
import { motion, useMotionValueEvent, useScroll } from "framer-motion"
import React, { useState } from "react"
import { visibleAnimation } from "@/lib/animations"
import { useDashboardBg } from "@/hooks/useDashboardBg"
import { isCustomImageBg } from "@/lib/themeBg"

export default function Header({
  embedded = false,
}: {
  role?: string | null
  embedded?: boolean
}) {
  const [hidden, setHidden] = useState<boolean>(false)

  const { scrollY } = useScroll()
  const { showMenu, toggleMenu } = useAppContext()
  const { resolvedBg } = useDashboardBg()
  const customBg = isCustomImageBg(resolvedBg)

  useMotionValueEvent(scrollY, "change", (latest) => {
    const prev = scrollY.getPrevious()

    if (prev && latest > prev && latest > 150) {
      setHidden(true)
    } else {
      setHidden(false)
    }
  })

  return (
    <motion.div
      variants={visibleAnimation}
      animate={hidden ? "hidden" : "visible"}
      className={`sticky top-0 z-30 flex min-h-[4.25rem] w-full min-w-0 items-center justify-between gap-3 overflow-x-clip border-b border-slate-100 bg-white/85 px-3 backdrop-blur-xl xs:px-4 dark:border-white/10 dark:bg-slate-900/80 ${
        embedded ? "" : "ml-auto md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)]"
      } ${
        customBg && !embedded
          ? "solune-glass border-b border-[var(--solune-border)]"
          : ""
      }`}
    >
      <div
        className={`relative h-3 w-8 rounded-sm hover:cursor-pointer md:hidden before:absolute before:top-[1px] before:h-[3px] before:w-full before:rounded-sm before:bg-slate-800 before:content-[''] after:absolute after:bottom-0 after:h-[3px] after:w-2/3 after:rounded-sm after:bg-slate-800 after:content-[''] dark:before:bg-white dark:after:bg-white ${
          showMenu
            ? "before:translate-x-3 after:translate-x-2 before:opacity-0 after:opacity-0"
            : "before:translate-x-0 after:translate-x-0"
        }`}
        onClick={toggleMenu}
      />

      <div className="hidden min-w-0 flex-1 md:block md:max-w-xl">
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
            pathClassName="stroke-slate-400"
          />
          <input
            type="search"
            placeholder="Search appointments, doctors, or clinics…"
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800/80 dark:text-white dark:focus:border-blue-500/50 dark:focus:ring-blue-500/20"
          />
        </label>
      </div>

      <div className="center min-w-0 shrink-0 gap-x-2 md:justify-end">
        <ModeToggle />

        <UserProfileControls />
      </div>
    </motion.div>
  )
}
