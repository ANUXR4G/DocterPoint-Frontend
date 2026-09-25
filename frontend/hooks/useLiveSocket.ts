"use client"

import { useEffect, useRef } from "react"
import { buildWsUrl } from "@/lib/wsOrigin"
import { ensureAccessToken } from "@/lib/accessToken"

export type LiveEvent =
  | {
      event: "booking_created" | "booking_updated"
      booking: Record<string, unknown>
    }
  | {
      event: "conversation_updated"
      conversation: Record<string, unknown>
    }
  | { event: "ops_invalidate"; domain: string }
  | Record<string, unknown>

type Options = {
  path: string | null
  onEvent: (event: LiveEvent) => void
  onReconnect?: () => void
  onOpen?: () => void
  onClose?: () => void
  enabled?: boolean
}

/**
 * Shared live socket for dashboards (not Mira).
 * Silent retries; refreshes access token before each connect (same as REST).
 */
export function useLiveSocket({
  path,
  onEvent,
  onReconnect,
  onOpen,
  onClose,
  enabled = true,
}: Options) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const reconnectRef = useRef(onReconnect)
  reconnectRef.current = onReconnect
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!enabled || !path) return

    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectNotifyTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let attempt = 0
    let everOpened = false
    let connectGen = 0

    function scheduleReconnectNotify() {
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer)
      reconnectNotifyTimer = setTimeout(() => {
        reconnectRef.current?.()
      }, 400)
    }

    function scheduleRetry() {
      if (closed) return
      attempt += 1
      const delay =
        attempt <= 6
          ? 400
          : Math.min(15_000, 1500 * 2 ** Math.min(attempt - 6, 4))
      retryTimer = setTimeout(() => {
        void connect()
      }, delay)
    }

    async function connect() {
      if (closed) return
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return
      }

      const gen = ++connectGen
      const token = await ensureAccessToken()
      if (closed || gen !== connectGen) return

      if (!token) {
        scheduleRetry()
        return
      }

      try {
        ws = new WebSocket(buildWsUrl(path!, token))
      } catch {
        scheduleRetry()
        return
      }

      ws.onopen = () => {
        openRef.current?.()
        if (everOpened) scheduleReconnectNotify()
        everOpened = true
        attempt = 0
      }

      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data) as LiveEvent)
        } catch {
          /* ignore malformed */
        }
      }

      ws.onerror = () => {
        /* silent — onclose retries */
      }

      ws.onclose = () => {
        // Skip intentional unmount — avoids Live badge flicker in Strict Mode.
        if (closed) return
        closeRef.current?.()
        scheduleRetry()
      }
    }

    function onVisibility() {
      if (document.visibilityState !== "visible" || closed) return
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        void connect()
      }
    }

    void connect()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      closed = true
      connectGen += 1
      document.removeEventListener("visibilitychange", onVisibility)
      if (retryTimer) clearTimeout(retryTimer)
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    }
  }, [path, enabled])
}
