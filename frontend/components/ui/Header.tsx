"use client"

import { useAppContext } from "@/hooks/useAppContext"
import { Icon } from "@/components"
import UserProfileControls from "@/components/menu/UserProfileControls"
import { ModeToggle } from "@/components/ui/mode-toggle"
import { motion, useMotionValueEvent, useScroll } from "framer-motion"
import React, { useState } from "react"
import { visibleAnimation } from "@/lib/animations"

export default function Header({
  embedded = false,
}: {
  role?: string | null
  embedded?: boolean
}) {
  const [hidden, setHidden] = useState<boolean>(false)

  const { scrollY } = useScroll()
  const { showMenu, toggleMenu } = useAppContext()

  useMotionValueEvent(scrollY, "change", (latest) => {
    // Dashboard shell keeps the bar pinned — never auto-hide there.
    if (embedded) return
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
      animate={embedded || !hidden ? "visible" : "hidden"}
      className={`sticky top-0 z-40 flex w-full min-w-0 shrink-0 items-center px-3 ${
        embedded
          ? "bg-[color-mix(in_srgb,var(--solune-canvas)_88%,transparent)] pb-1 pt-1 backdrop-blur-md dark:bg-[color-mix(in_srgb,#0f172a_88%,transparent)] xs:px-4"
          : "ml-auto pt-2 xs:px-4 md:w-[calc(100%-72px)] xl:w-[calc(100%-240px)]"
      }`}
    >
      <div className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-full border border-slate-200/80 bg-white/85 px-2 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/90 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)] sm:px-3 ${
        embedded ? "h-12" : "h-14"
      }`}>
        <div
          className={`relative ml-2 h-3 w-8 shrink-0 rounded-sm hover:cursor-pointer md:hidden before:absolute before:top-[1px] before:h-[3px] before:w-full before:rounded-sm before:bg-slate-800 before:content-[''] after:absolute after:bottom-0 after:h-[3px] after:w-2/3 after:rounded-sm after:bg-slate-800 after:content-[''] dark:before:bg-white dark:after:bg-white ${
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
              className="gg-bare-input h-10 w-full rounded-full bg-transparent pl-11 pr-4 text-sm font-medium outline-none placeholder:font-medium dark:placeholder:text-slate-500"
            />
          </label>
        </div>

        <div className="center ml-auto min-w-0 shrink-0 gap-x-1.5 md:justify-end">
          <ModeToggle className="border-transparent bg-transparent shadow-none dark:border-transparent dark:bg-transparent" />
          <UserProfileControls />
        </div>
      </div>
    </motion.div>
  )
}
