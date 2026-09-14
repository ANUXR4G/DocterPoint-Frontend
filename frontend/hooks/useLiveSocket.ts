"use client"

import { useEffect, useRef } from "react"
import { buildWsUrl, readAccessTokenFromCookie } from "@/lib/wsOrigin"

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
  enabled?: boolean
}

/**
 * Shared live socket for dashboards (not Mira).
 * Silent retries; debounced reconnect notify; skips when no auth cookie.
 */
export function useLiveSocket({
  path,
  onEvent,
  onReconnect,
  enabled = true,
}: Options) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const reconnectRef = useRef(onReconnect)
  reconnectRef.current = onReconnect

  useEffect(() => {
    if (!enabled || !path) return

    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectNotifyTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let attempt = 0
    let everOpened = false

    function scheduleReconnectNotify() {
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer)
      reconnectNotifyTimer = setTimeout(() => {
        reconnectRef.current?.()
      }, 400)
    }

    function connect() {
      if (closed) return
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return
      }

      const token = readAccessTokenFromCookie()
      if (!token) {
        attempt += 1
        const delay = Math.min(15_000, 1500 * 2 ** Math.min(attempt, 4))
        retryTimer = setTimeout(connect, delay)
        return
      }

      try {
        ws = new WebSocket(buildWsUrl(path!, token))
      } catch {
        attempt += 1
        const delay = Math.min(30_000, 1000 * 2 ** attempt)
        retryTimer = setTimeout(connect, delay)
        return
      }

      ws.onopen = () => {
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
        if (closed) return
        const delay = Math.min(30_000, 1000 * 2 ** attempt)
        attempt += 1
        retryTimer = setTimeout(connect, delay)
      }
    }

    function onVisibility() {
      if (document.visibilityState !== "visible" || closed) return
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect()
      }
    }

    connect()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      closed = true
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
