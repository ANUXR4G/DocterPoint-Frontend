"use client"

import { useEffect, useRef } from "react"
import { useAdminOpsSocket } from "@/hooks/useProctoSocket"

/** Soft-refresh admin list pages on ops_invalidate / reconnect. */
export function useAdminOpsRefresh(refresh: () => void, enabled = true) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function soft() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => refreshRef.current(), 250)
  }

  useAdminOpsSocket(enabled, soft, soft)
}
