import { useCallback, useEffect, useRef, useState } from "react"
import { readAccessTokenFromCookie } from "@/lib/wsOrigin"

/** Low-level WebSocket hook with token query + reconnect. Prefer useLiveSocket for dashboards. */
export function useSocket<T>(url: string | null, retryInterval: number = 5000) {
  const [values, setValues] = useState<T | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false)
  const socketRef = useRef<WebSocket | null>(null)
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closedRef = useRef(false)

  const connect = useCallback(() => {
    if (!url || closedRef.current) return

    const token = readAccessTokenFromCookie()
    const withToken =
      token && !url.includes("token=")
        ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
        : url

    socketRef.current = new WebSocket(withToken)

    socketRef.current.onopen = () => {
      setIsConnected(true)
      setIsReconnecting(false)
    }

    socketRef.current.onclose = () => {
      setIsConnected(false)
      if (closedRef.current) return
      setIsReconnecting(true)
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
      retryTimeout.current = setTimeout(() => {
        connect()
      }, retryInterval)
    }

    socketRef.current.onmessage = (event: MessageEvent) => {
      try {
        setValues(JSON.parse(event.data) as T)
      } catch {
        /* ignore */
      }
    }

    socketRef.current.onerror = () => {
      socketRef.current?.close()
    }
  }, [retryInterval, url])

  useEffect(() => {
    closedRef.current = false
    if (url) connect()

    return () => {
      closedRef.current = true
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
      socketRef.current?.close()
    }
  }, [url, connect])

  return {
    values,
    socketRef,
    isConnected,
    isReconnecting,
  }
}
