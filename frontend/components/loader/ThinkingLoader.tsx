"use client"

import { useEffect, useState } from "react"
import { ThinkingOrb, type OrbState } from "thinking-orbs"
import { cn } from "@/lib/utils"

/** Orb states used only as loading indicators — not marketing UI. */
export const LOADER_ORB_STATES: { state: OrbState; label: string }[] = [
  { state: "working", label: "Working" },
  { state: "searching", label: "Searching" },
  { state: "solving", label: "Solving" },
  { state: "listening", label: "Listening" },
  { state: "composing", label: "Composing" },
  { state: "breathing", label: "Breathing" },
]

type ThinkingLoaderProps = {
  className?: string
  /** Pin a single state; omit to cycle through all loader states */
  state?: OrbState
  size?: 20 | 64
  label?: string
  /** Full-viewport centered overlay (route loading) */
  fullPage?: boolean
  /** When cycling, milliseconds between states (fullPage default 1400) */
  cycleMs?: number
}

/**
 * Site loading indicator powered by `thinking-orbs`.
 * States: Working · Searching · Solving · Listening · Composing · Breathing
 */
export default function ThinkingLoader({
  className,
  state,
  size = 64,
  label,
  fullPage = false,
  cycleMs = 1400,
}: ThinkingLoaderProps) {
  const [cycleIndex, setCycleIndex] = useState(0)
  const shouldCycle = fullPage && state == null

  useEffect(() => {
    if (!shouldCycle) return
    const id = window.setInterval(() => {
      setCycleIndex((i) => (i + 1) % LOADER_ORB_STATES.length)
    }, cycleMs)
    return () => window.clearInterval(id)
  }, [shouldCycle, cycleMs])

  const active = shouldCycle
    ? LOADER_ORB_STATES[cycleIndex]
    : LOADER_ORB_STATES.find((s) => s.state === state) ?? LOADER_ORB_STATES[0]

  const displayLabel = label ?? active.label

  const orb = (
    <ThinkingOrb
      state={active.state}
      size={size}
      theme="auto"
      aria-label={displayLabel}
      className={cn(!fullPage && className)}
    />
  )

  if (!fullPage) {
    return (
      <div
        role="status"
        className={cn("inline-flex items-center justify-center", className)}
      >
        {orb}
        <span className="sr-only">{displayLabel}</span>
      </div>
    )
  }

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-white dark:bg-[#090909]",
        className,
      )}
    >
      {orb}
      <p className="min-h-[1.25rem] text-[13px] font-medium tracking-[-0.13px] text-neutral-500 dark:text-[#999999]">
        {displayLabel}
      </p>
    </div>
  )
}
