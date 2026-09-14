"use client"

import { useCallback, useEffect, useState } from "react"
import { adminService } from "@/lib/services/admin"
import { useAdminOpsSocket } from "@/hooks/useProctoSocket"

/** Poll admin help-desk unread total for sidebar badges — live via admin ops WS. */
export function useAdminSupportUnread(enabled: boolean) {
  const [unreadTotal, setUnreadTotal] = useState(0)

  const refresh = useCallback(async () => {
    const res = await adminService.supportHelpThreads()
    if (res.status === "successful" && res.data) {
      setUnreadTotal(res.data.totalUnread ?? 0)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setUnreadTotal(0)
      return
    }
    void refresh()
  }, [enabled, refresh])

  useAdminOpsSocket(
    enabled,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        (event.event === "ops_invalidate" ||
          // help messages also arrive on admin help pool; ops covers list refresh
          event.event === "support_message")
      ) {
        void refresh()
      }
      // Any admin help message shape from legacy pool
      if (event && typeof event === "object" && "type" in event) {
        void refresh()
      }
    },
    () => void refresh(),
  )

  return { unreadTotal, refresh }
}
