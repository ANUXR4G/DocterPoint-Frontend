"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  adminService,
  type AdminHelpThread,
  type AdminHelpMessage,
} from "@/lib/services/admin"
import { useSocket } from "@/hooks/useSocket"
import { buildWsUrl } from "@/lib/wsOrigin"
import { useAdminOpsSocket } from "@/hooks/useProctoSocket"

type Props = {
  selectedUserId: string | null
  onSelectUser: (userId: string | null) => void
  onThreadsRefresh: () => void
}

export default function AdminSupportHelpDesk({
  selectedUserId,
  onSelectUser,
  onThreadsRefresh,
}: Props) {
  const [threads, setThreads] = useState<AdminHelpThread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [messages, setMessages] = useState<AdminHelpMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const socketUrl = useMemo(
    () => buildWsUrl("/api/v1/ws/admin/help"),
    [],
  )
  const { values, socketRef, isConnected } = useSocket<AdminHelpMessage>(socketUrl)

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true)
    const res = await adminService.supportHelpThreads()
    if (res.status === "successful" && res.data) {
      setThreads(res.data.threads ?? [])
    }
    setLoadingThreads(false)
  }, [])

  const loadMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true)
    setError("")
    const res = await adminService.supportHelpThread(userId)
    if (res.status === "successful" && res.data) {
      setMessages(res.data.messages ?? [])
      await adminService.supportMarkThreadSeen(userId)
      onThreadsRefresh()
    } else {
      setError(res.message || "Could not load conversation")
    }
    setLoadingMessages(false)
  }, [onThreadsRefresh])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useAdminOpsSocket(
    true,
    () => {
      void loadThreads()
      onThreadsRefresh()
    },
    () => {
      void loadThreads()
      onThreadsRefresh()
    },
  )

  useEffect(() => {
    if (!selectedUserId) {
      setMessages([])
      return
    }
    void loadMessages(selectedUserId)
  }, [selectedUserId, loadMessages])

  useEffect(() => {
    if (!values || !selectedUserId) return
    const threadUserId =
      values.type === "help" ? values.sender_id : values.sender_id
    if (threadUserId !== selectedUserId) {
      void loadThreads()
      return
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === values.id)) return prev
      return [values, ...prev]
    })
    void loadThreads()
  }, [values, selectedUserId, loadThreads])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, selectedUserId])

  async function sendReply() {
    if (!selectedUserId || !draft.trim() || sending) return
    setSending(true)
    setError("")

    const content = draft.trim()
    const viaSocket =
      socketRef.current &&
      isConnected &&
      socketRef.current.readyState === WebSocket.OPEN

    try {
      if (viaSocket) {
        socketRef.current!.send(
          JSON.stringify({ user_id: selectedUserId, content }),
        )
        setDraft("")
      } else {
        const res = await adminService.supportReply(selectedUserId, content)
        if (res.status !== "successful" && res.status !== "created") {
          setError(res.message || "Could not send reply")
        } else {
          setDraft("")
          await loadMessages(selectedUserId)
        }
      }
      await loadThreads()
    } catch {
      setError("Could not send reply")
    } finally {
      setSending(false)
    }
  }

  const selectedThread = threads.find((t) => t.userId === selectedUserId)

  return (
    <div className="grid min-h-[28rem] grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
      <aside className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
        <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Help conversations
            </h3>
            {threads.some((t) => t.unreadCount > 0) ? (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {threads.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0)} new
              </span>
            ) : null}
          </div>
          <p className="text-xs text-neutral-500">
            Same messages users send from the Help popup
          </p>
        </div>
        <div className="max-h-[24rem] overflow-y-auto">
          {loadingThreads ? (
            <p className="p-4 text-sm text-neutral-500">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">No help messages yet.</p>
          ) : (
            <ul>
              {threads.map((thread) => {
                const active = thread.userId === selectedUserId
                return (
                  <li key={thread.userId}>
                    <button
                      type="button"
                      onClick={() => onSelectUser(thread.userId)}
                      className={`w-full border-b border-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60 ${
                        active ? "bg-sky-50 dark:bg-blue-500/10" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                            {thread.user?.name ||
                              thread.user?.email ||
                              "Unknown user"}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {thread.user?.role} · {thread.user?.email}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium text-neutral-400">
                            {(thread.messageCount ?? 0) === 1
                              ? "1 message"
                              : `${thread.messageCount ?? 0} messages`}
                          </p>
                        </div>
                        {thread.unreadCount > 0 ? (
                          <span
                            className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white"
                            title={`${thread.unreadCount} unread`}
                          >
                            {thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      {thread.latestMessage ? (
                        <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                          {thread.latestMessage.content}
                        </p>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-h-[28rem] flex-col rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
        {!selectedUserId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-neutral-500">
            Select a conversation to view help messages and reply.
          </div>
        ) : (
          <>
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                {selectedThread?.user?.name || selectedThread?.user?.email}
              </h3>
              <p className="text-xs text-neutral-500">
                {isConnected ? "Live · connected" : "Reply via API (websocket reconnecting)"}
              </p>
            </div>

            <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
              {loadingMessages ? (
                <p className="text-sm text-neutral-500">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-neutral-500">No messages in this thread.</p>
              ) : (
                messages.map((msg) => {
                  const fromUser = msg.type === "help"
                  return (
                    <div
                      key={msg.id}
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        fromUser
                          ? "self-start rounded-bl-md bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                          : "self-end rounded-br-md bg-[var(--theme-primary)] text-white"
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p className="mt-1 text-[10px] opacity-70">
                        {msg.created_at
                          ? format(new Date(msg.created_at), "dd MMM · HH:mm")
                          : ""}
                      </p>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {error ? (
              <p className="px-4 text-sm font-medium text-red-600">{error}</p>
            ) : null}

            <div className="border-t border-neutral-200 p-4 dark:border-neutral-700">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void sendReply()
                    }
                  }}
                  rows={2}
                  placeholder="Type a reply to the user…"
                  className="min-h-[4rem] flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-[var(--theme-primary)] dark:border-neutral-700 dark:bg-neutral-800"
                />
                <button
                  type="button"
                  disabled={sending || !draft.trim()}
                  onClick={() => void sendReply()}
                  className="self-end rounded-full bg-[var(--theme-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
