import { TMessage, TSocketMessage } from "@/types"
import { useEffect, useRef, useState } from "react"
import { useToken } from "./useToken"
import { useUser } from "./useUser"
import { useInfiniteQuery } from "react-query"
import { chatService } from "@/lib/services/chat"
import { firey } from "@/utils"
import { useObserver } from "./useObserver"
import { useSocket } from "./useSocket"

export function useChat(role: string, receiverId?: string) {
  const [limit] = useState<number>(20)

  const [value, setValue] = useState<string>("")
  const [messages, setMessages] = useState<TMessage[]>([])

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const token = useToken()
  const { data: userInfo } = useUser(role)

  // Retrieve all the conversations of the User
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [`user:chats:${receiverId ? `direct` : `help`}`],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(limit),
      }).toString()

      if (!userInfo) throw new Error(`Failed to retrieve chats`)
      if (receiverId) {
        return chatService.getUserDirectChats(
          token,
          userInfo.id,
          receiverId,
          params
        )
      } else {
        return chatService.getUserHelpChats(token, userInfo.id, params)
      }
    },
    getNextPageParam(lastPage, allPages) {
      const currentPage = allPages.length
      const totalPages = Math.ceil(lastPage.total / limit)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    onSuccess: (data) => {
      const messages = data?.pages.flatMap((page) => page.messages) || []
      setMessages(messages)
    },
    select: (data) => firey.convertKeysToCamelCase(data),
    staleTime: 0,
    // Keep previous data while fetching next page
    keepPreviousData: true,
  })

  const topRef = useObserver({
    root: null,
    threshold: 1.0,
    onIntersect: () => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
  })

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
    const data = {
      type: receiverId ? "direct" : "help",
      content: value,
      sender_id: userInfo.id,
      ...(receiverId && { receiver_id: receiverId }),
    }

    // Send the message through WebSocket
    socketRef.current.send(JSON.stringify(data))

    setValue("") // Reset the prompt value
  }

  // Send message on Keyboard Press 'Enter'
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Store the realtime message from WebSocket
  useEffect(() => {
    if (!values) return

    const data: TMessage = {
      id: values.id,
      senderId: values.sender_id,
      type: values.type,
      content: values.content,
      createdAt: values.created_at,
      isSeen: values.is_seen,
      ...(receiverId && { receiverId }),
    }

    setMessages((prev) => {
      const exists = prev.find((msg) => msg.id === values.id)

      return exists ? prev : [data, ...prev]
    })
  }, [values, receiverId])

  return {
    value,
    sendMessage,
    messages,
    userInfo,
    topRef,
    bottomRef,
    isFetchingNextPage,
    setValue,
    handleKeyDown,
  }
}
