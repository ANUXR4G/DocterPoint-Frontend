"use client"

import { useLiveSocket, type LiveEvent } from "@/hooks/useLiveSocket"
import type { ProctoWsEvent } from "@/lib/services/procto"

export function useProctoSocket(
  practiceId: string | null,
  onEvent: (event: ProctoWsEvent) => void,
  onReconnect?: () => void,
  onOpen?: () => void,
  onClose?: () => void,
) {
  useLiveSocket({
    path: practiceId ? `/api/v1/ws/procto/${practiceId}` : null,
    onEvent: (event: LiveEvent) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        (event.event === "booking_created" ||
          event.event === "booking_updated" ||
          event.event === "conversation_updated")
      ) {
        onEvent(event as ProctoWsEvent)
      }
    },
    onReconnect,
    onOpen,
    onClose,
  })
}

export function usePatientLiveSocket(
  enabled: boolean,
  onEvent: (event: LiveEvent) => void,
  onReconnect?: () => void,
  onOpen?: () => void,
  onClose?: () => void,
) {
  useLiveSocket({
    path: "/api/v1/ws/patient",
    enabled,
    onEvent,
    onReconnect,
    onOpen,
    onClose,
  })
}

export function useAdminOpsSocket(
  enabled: boolean,
  onEvent: (event: LiveEvent) => void,
  onReconnect?: () => void,
) {
  useLiveSocket({
    path: "/api/v1/ws/admin/ops",
    enabled,
    onEvent,
    onReconnect,
  })
}
