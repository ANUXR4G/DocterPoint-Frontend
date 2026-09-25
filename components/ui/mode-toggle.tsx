"use client"

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react"
import { AnimatePresence, motion } from "framer-motion"
import { useAppContext } from "@/hooks/useAppContext"
import type { ThemeOptions } from "@/app/providers"
import { cn } from "@/lib/utils"

const CYCLE: ThemeOptions[] = ["system", "light", "dark"]

const LABELS: Record<ThemeOptions, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
}

function nextTheme(current: ThemeOptions | null): ThemeOptions {
  const i = CYCLE.indexOf(current ?? "system")
  return CYCLE[(i + 1) % CYCLE.length]
}

/**
 * One-click theme button. Defaults to system; each click cycles
 * system → light → dark → system with an icon animation.
 */
export function ModeToggle({ className }: { className?: string }) {
  const { theme, changeTheme } = useAppContext()
  const active: ThemeOptions = theme ?? "system"
  const upcoming = nextTheme(active)

  return (
    <button
      type="button"
      aria-label={`Theme: ${LABELS[active]}. Click for ${LABELS[upcoming]}`}
      title={`${LABELS[active]} · click for ${LABELS[upcoming]}`}
      onClick={() => changeTheme(upcoming)}
      className={cn(
        "relative z-50 inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200/80 bg-white/70 text-neutral-900 shadow-sm transition-colors dark:border-white/10 dark:bg-[#0f172a]/90 dark:text-white",
        "hover:bg-black/5 dark:hover:bg-white/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={active}
          initial={{ opacity: 0, rotate: -90, scale: 0.5, y: 6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1, y: 0 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.5, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {active === "light" ? (
            <IconSun className="size-5" stroke={1.75} />
          ) : active === "dark" ? (
            <IconMoon className="size-5" stroke={1.75} />
          ) : (
            <IconDeviceDesktop className="size-5" stroke={1.75} />
          )}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">
        Theme {LABELS[active]}, switch to {LABELS[upcoming]}
      </span>
    </button>
  )
}

export default ModeToggle
