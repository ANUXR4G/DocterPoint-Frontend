import { useCallback, useEffect, useRef, useState } from "react"

export function useSocket<T>(url: string | null, retryInterval: number = 5000) {
  const [values, setValues] = useState<T | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false)
  const socketRef = useRef<WebSocket | null>(null)
  const retryTimeout = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (!url) return

    socketRef.current = new WebSocket(url)

    socketRef.current.onopen = () => {
      setIsConnected(true)
      setIsReconnecting(false)
      console.log("websocket connected.")
    }

    socketRef.current.onclose = () => {
      setIsConnected(false)
      console.log("websocket disconnected.")
      setIsReconnecting(true)

      // retry to connect again
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
      retryTimeout.current = setTimeout(() => {
        console.log("reconnecting to websocket...")
        connect()
      }, retryInterval)
    }

    socketRef.current.onmessage = (event: MessageEvent) => {
      setValues(JSON.parse(event.data))
    }

    socketRef.current.onerror = () => {
      if (!socketRef.current) return
      socketRef.current.close() // close connection to trigger onclose
    }
  }, [retryInterval, url])

  useEffect(() => {
    if (url) connect()

    return () => {
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
    }
  }, [url, connect])

  return {
    values,
    socketRef,
    isConnected,
    isReconnecting,
  }
}
