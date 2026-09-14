"use client"

import ThinkingLoader from "@/components/loader/ThinkingLoader"

/** Compact inline spinner replaced with thinking-orbs. */
export default function SimpleSpinner({ className }: { className?: string }) {
  return (
    <ThinkingLoader
      className={className}
      size={20}
      state="working"
      label="Loading…"
    />
  )
}
