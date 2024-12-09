import { useEffect, useRef, useState } from "react"

export function useSocket<T>(url: string | null, retryInterval: number = 5000) {
  const [values, setValues] = useState<T | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const socketRef = useRef<WebSocket | null>(null)
  const retryTimeout = useRef<NodeJS.Timeout | null>(null)

  function connect() {
    if (!url) return

    socketRef.current = new WebSocket(url)

    socketRef.current.onopen = () => {
      setIsConnected(true)
      console.log("websocket connected!")
    }

    socketRef.current.onclose = () => {
      setIsConnected(false)
      console.log("websocket disconnected!")
      retryConnection()
    }

    socketRef.current.onmessage = (event: MessageEvent) => {
      setValues(JSON.parse(event.data))
    }

    socketRef.current.onerror = (error: Event) => {
      // console.error("webSocket error: ", error)
      socketRef.current?.close() // close connection to trigger onclose
    }
  }

  function retryConnection() {
    if (retryTimeout.current) clearTimeout(retryTimeout.current)
    retryTimeout.current = setTimeout(() => {
      console.log("reconnecting to websocket...")
      connect()
    }, retryInterval)
  }

  useEffect(() => {
    connect()

    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }

      if (retryTimeout.current) clearTimeout(retryTimeout.current)
    }
  }, [url])

  return {
    values,
    isConnected,
  }
}
