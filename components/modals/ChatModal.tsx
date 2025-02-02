"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

import { useApi } from "@/hooks/useApi"
import { useSocket } from "@/hooks/useSocket"
import { useProfile } from "@/hooks/useProfile"
import { useObserver } from "@/hooks/useObserver"
import { useAppContext } from "@/hooks/useAppContext"

import { firey } from "@/utils"
import { chatService } from "@/lib/services/chat"
import { TMessage, TSocketMessage } from "@/types"

import { CityScene, Icon, Modal } from "@/components"

export default function SimpleModal() {
  const { showChat, toggleChat } = useAppContext()
  const { data: userInfo } = useProfile()

  const [page, setPage] = useState<number>(1)
  const [limit] = useState<number>(20)

  const [value, setValue] = useState<string>("")
  const [messages, setMessages] = useState<TMessage[]>([])
  const [allowFetching, setAllowFetching] = useState(false)

  const chatContainer = useRef<HTMLDivElement | null>(null)

  const params = firey.createSearchParams({
    page,
    limit,
  })

  // Retrieve all the conversations of the User
  const { data: retrievedChats, isLoading } = useApi(
    [`user:chats:${userInfo?.id}:page:${page}`],
    (_, token) => {
      if (!userInfo) throw new Error(`Failed to retrieve user chats.`)
      return chatService.getUserHelpChats(token, userInfo.id, params.toString())
    },
    {
      enabled: !!userInfo?.id,
      staleTime: 0,
      select: (data) =>
        firey.convertKeysToCamelCase(data) as {
          total: number
          messages: TMessage[]
        },
      onSuccess: (data) => {
        const incomingMessages = data.messages.map((msg) => ({
          id: msg.id,
          type: msg.type,
          content: msg.content,
          isSeen: msg.isSeen,
          senderId: msg.senderId,
          createdAt: new Date(msg.createdAt),
        }))

        // Keep appending incoming messages for infinite scroll
        setMessages((prev) => [...prev, ...incomingMessages])
      },
    }
  )

  // Define the Socket URL using the users id
  const socketURL = userInfo
    ? `ws://localhost:8000/api/v1/ws/chats/${userInfo.id}`
    : null

  // Connect the Chatting Socket Connection through the hook
  const { values, socketRef, isConnected, isReconnecting } =
    useSocket<TSocketMessage>(socketURL, 3000)

  // Handle sending new messages
  function sendMessage() {
    if (
      !socketRef.current ||
      !userInfo ||
      value.trim() === "" ||
      !isConnected ||
      isReconnecting
    )
      return

    // Only send the message if the conditions on the top gets fullfilled
    socketRef.current.send(
      JSON.stringify({
        type: "help",
        content: value,
        sender_id: userInfo.id,
      })
    )

    setValue("") // Reset the prompt value
  }

  // Send message on Keyboard Press 'Enter'
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Add the incoming messages thats coming through the WebSocket connection
  useEffect(() => {
    if (!values) return

    setMessages((prev) => {
      const exists = prev.some((msg) => msg.id === values.id) // Prevent data duplication

      return exists
        ? prev
        : [
            {
              id: values.id,
              type: values.type,
              content: values.content,
              isSeen: values.is_seen,
              senderId: values.sender_id,
              createdAt: new Date(values.created_at),
            },
            ...prev,
          ]
    })
  }, [values])

  // Handle Infinite Scrolling through Observer
  const observerRef = useObserver({
    root: null,
    threshold: 0,
    onIntersect: () => {
      if (!retrievedChats || !allowFetching || isLoading) return

      const totalPages = Math.ceil(retrievedChats.total / limit)
      if (page < totalPages) setPage((prev) => prev + 1)
    },
  })

  // Close the modal and Reset everything
  function handleCloseModal() {
    toggleChat()
    setPage(1)
    setMessages([])
    setAllowFetching(false)
  }

  // Handle Infinite Scrolling based on the chat container's current scrolling position
  useEffect(() => {
    if (!chatContainer.current) return
    chatContainer.current.addEventListener("scroll", (e) => {
      if ((e.target as HTMLDivElement).scrollTop < 0) {
        setAllowFetching(true)
      }
    })
  }, [])

  const selfMsgClass = `self-end rounded-bl-xl bg-gradient-to-l from-blue-600/90 dark:from-blue-500 to-indigo-600/90 dark:to-indigo-500 text-neutral-100`
  const receivedMsgClass = `rounded-br-xl bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 text-neutral-800 self-start`

  if (!showChat) return

  return (
    <Modal
      className="h-3/4 sm:h-3/4 w-full max-w-[720px]"
      direction="center"
      open={showChat}
      handler={handleCloseModal}
      primaryBtn={
        <button
          className="mr-0.5 py-3 px-5 bg-gradient-to-l from-blue-500 to-indigo-500 text-neutral-100 text-sm font-medium rounded-lg disabled:opacity-50 disabled:pointer-events-none"
          disabled={value.trim() === ""}
        >
          Send Now
        </button>
      }
    >
      <div className="flex flex-col size-full gap-3 overflow-hidden">
        {/* Chat Container */}
        <div className="flex-1 overflow-hidden">
          <div
            ref={chatContainer}
            className={`flex gap-2 px-4 size-full overflow-y-auto no-scrollbar ${
              messages.length > 0 ? `flex-col-reverse` : ``
            }`}
          >
            {messages.length > 0 ? (
              messages.map((msg, idx) => (
                <motion.div
                  key={`msg-${idx}-${msg.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`text-sm w-fit max-w-[60%] text-wrap px-3 py-2.5 rounded-t-xl first-of-type:mb-3 md:first-of-type:mb-5 ${
                    msg.type === "direct"
                      ? msg.senderId === userInfo?.id
                        ? selfMsgClass
                        : receivedMsgClass
                      : msg.type === "help"
                      ? selfMsgClass
                      : receivedMsgClass
                  }`}
                >
                  {msg.content}
                </motion.div>
              ))
            ) : (
              // Empty Chat Container
              <div className="mx-auto mt-10">
                <CityScene content="Start Messaging" />
              </div>
            )}

            {/* Loading Indicator for Infinite Scrolling Feature */}
            {isLoading && (
              <div className="size-8 mx-auto mb-5">
                <Icon
                  name="spinning-loader"
                  className="fill-[--primary-black] dark:fill-[--primary-white]"
                />
              </div>
            )}
            <div className="mt-3" ref={observerRef} />
          </div>
        </div>

        {/* Message prompt */}
        <div className="min-h-24 w-full px-4">
          <textarea
            className="size-full outline-none p-3 resize-none text-sm font-medium bg-neutral-200/70 dark:bg-neutral-800 rounded-lg"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
          />
        </div>
      </div>
    </Modal>
  )
}
