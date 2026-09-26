"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import { useProctoSocket } from "@/hooks/useProctoSocket"

export const PRACTICE_NOTIFICATIONS_CHANGED = "gg:notifications-changed"

/** Tell nav badges to refresh after dismiss / send. */
export function emitPracticeNotificationsChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(PRACTICE_NOTIFICATIONS_CHANGED))
}

/**
 * Open (undismissed) practice notification count for doctor/clinic sidebar badges.
 * Matches the "X open" total on the Notifications page.
 */
export function usePracticeOpenNotifications(enabled: boolean) {
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const practiceIdRef = useRef<string | null>(null)
  practiceIdRef.current = practiceId

  const refresh = useCallback(async () => {
    if (!enabled) {
      setOpenCount(0)
      setPracticeId(null)
      return
    }
    try {
      let id = practiceIdRef.current
      if (!id) {
        const mine = await proctoService.getMyPractices()
        if (
          mine.status !== "successful" ||
          !Array.isArray(mine.data) ||
          !mine.data[0]
        ) {
          setOpenCount(0)
          return
        }
        id = proctoService.resolvePracticeId(
          mine.data[0] as {
            practiceId?: string
            practice?: { id?: string } | null
            id?: string
          },
        )
        if (!id) {
          setOpenCount(0)
          return
        }
        setPracticeId(id)
        practiceIdRef.current = id
      }
      const res = await proctoService.listPracticeNotifications(id, { take: 1 })
      if (res.status === "successful" && res.data) {
        const data = res.data as { total?: number }
        setOpenCount(typeof data.total === "number" ? data.total : 0)
      }
    } catch {
      /* keep last known count */
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setOpenCount(0)
      setPracticeId(null)
      return
    }
    void refresh()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    const onChange = () => void refresh()
    window.addEventListener(PRACTICE_NOTIFICATIONS_CHANGED, onChange)
    window.addEventListener("focus", onChange)
    return () => {
      window.removeEventListener(PRACTICE_NOTIFICATIONS_CHANGED, onChange)
      window.removeEventListener("focus", onChange)
    }
  }, [enabled, refresh])

  useProctoSocket(
    enabled ? practiceId : null,
    (event) => {
      if (
        event.event === "notification_created" ||
        event.event === "booking_created" ||
        event.event === "booking_updated" ||
        event.event === "conversation_updated"
      ) {
        void refresh()
      }
    },
    () => void refresh(),
  )

  return { openCount, refresh, practiceId }
}
