"use client"

import { motion } from "framer-motion"

import { CityScene, Icon, Modal } from "@/components"
import { useChat } from "@/hooks/useChat"

type Props = {
  isOpen: boolean
  toggleChat: () => void
  receiverId?: string
  role?: string | null
}

export default function ChatModal({
  isOpen,
  toggleChat,
  receiverId,
  role = "user",
}: Props) {
  const {
    value,
    sendMessage,
    messages,
    userInfo,
    topRef,
    bottomRef,
    isFetchingNextPage,
    setValue,
    handleKeyDown,
  } = useChat(role || "default", receiverId)

  const selfMsgClass = `self-end rounded-bl-xl bg-gradient-to-l from-blue-600/90 dark:from-blue-500 to-indigo-600/90 dark:to-indigo-500 text-neutral-100`
  const receivedMsgClass = `rounded-br-xl bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 text-neutral-800 self-start`

  return (
    <Modal
      className="h-3/4 sm:h-3/4 w-full flex flex-col max-w-[720px]"
      direction="center"
      open={isOpen}
      handler={toggleChat}
      primaryBtn={
        <motion.button
          className="mr-0.5 py-3 px-5 bg-gradient-to-l from-blue-500 to-indigo-500 text-neutral-100 text-sm font-medium rounded-lg disabled:opacity-50 disabled:pointer-events-none"
          disabled={value.trim() === ""}
          onClick={sendMessage}
          whileHover={{ scale: 0.985 }}
        >
          Send Now
        </motion.button>
      }
    >
      {/* Chat Container */}
      <div
        className={`size-full p-4 no-scrollbar overflow-y-auto gap-2 flex flex-col-reverse`}
      >
        {messages.length > 0 ? (
          messages.map((msg: any) => (
            <motion.div
              key={`msg-${msg.id}`}
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
          <div className="size-full center">
            <CityScene className="relative size-64" content="Start Messaging" />
          </div>
        )}

        {/* Loading Indicator */}
        <div className="min-h-1 mx-auto" ref={topRef}>
          {isFetchingNextPage && (
            <Icon
              name="spinning-loader"
              className="size-6 fill-neutral-700 dark:fill-neutral-300"
            />
          )}
        </div>
      </div>

      <div ref={bottomRef} />

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
    </Modal>
  )
}
