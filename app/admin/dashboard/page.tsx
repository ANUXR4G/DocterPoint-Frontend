"use client"

import { useSocket } from "@/hooks/useSocket"
import { useState } from "react"

export default function Page() {
  const [value, setValue] = useState<string>("")

  // Define the url and connect the WebSocket through hook
  const socketURL = `ws://localhost:8000/api/v1/ws/admin/help`
  const { socketRef, isConnected, isReconnecting } = useSocket(socketURL)

  function sendMessage() {
    if (
      !socketRef.current ||
      value.trim() === "" ||
      !isConnected ||
      isReconnecting
    )
      return
    socketRef.current.send(
      JSON.stringify({
        type: "reply",
        content: value,
        user_id: `t2FwCbS2Rdy9BtWQkximWQ`,
      })
    )
    setValue("")
  }

  // Handle sending messages on key press 'Enter'
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <div className="min-h-24 w-full px-4">
        <textarea
          className="size-full outline-none p-3 resize-none text-sm font-medium bg-neutral-200/70 dark:bg-neutral-800 rounded-xl"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
      </div>
    </div>
  )
}
