"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { RefreshCw } from "lucide-react"

const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? ""
const CHECK_MS = 60_000

function isUserBusy(): boolean {
  // Next keeps previously visited pages mounted but hidden — ignore their dialogs.
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [aria-modal="true"]',
  )
  if ([...dialogs].some((d) => d.getClientRects().length > 0)) return true
  const el = document.activeElement
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}

/**
 * Open dashboard tabs keep running the JavaScript they loaded, so fixes shipped
 * after that never reach them. Compare with the live build and reload.
 */
export default function NewVersionWatcher() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!LOADED_BUILD || stale) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch("/api/app-version", { cache: "no-store" })
        if (!res.ok) return
        const { buildId } = (await res.json()) as { buildId?: string }
        if (!cancelled && buildId && buildId !== LOADED_BUILD) setStale(true)
      } catch {
        // Offline or mid-deploy — try again on the next tick.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    void check()
    const id = window.setInterval(check, CHECK_MS)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [stale])

  // Moving to another page: load it fresh instead of asking.
  const pathname = usePathname()
  const stalePath = useRef<string | null>(null)
  useEffect(() => {
    if (!stale) return
    if (stalePath.current === null) {
      stalePath.current = pathname
      return
    }
    if (pathname !== stalePath.current) window.location.reload()
  }, [stale, pathname])

  // Coming back to a stale tab: reload before the user starts working in it,
  // unless they are mid-way through a dialog or form (unsaved input).
  useEffect(() => {
    if (!stale) return
    const onVisible = () => {
      if (document.visibilityState !== "visible" || isUserBusy()) return
      window.location.reload()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [stale])

  if (!stale) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
    >
      <span>GlucoGuide was updated — reload to get the latest version.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--theme-primary)] px-3 py-1.5 text-xs font-bold text-white"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Reload
      </button>
    </div>
  )
}
