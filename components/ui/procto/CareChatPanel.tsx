"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { chatService } from "@/lib/services/chat"
import { useSocket } from "@/hooks/useSocket"
import { buildWsUrl } from "@/lib/wsOrigin"
import { cookies } from "@/utils/cookies"
import { firey } from "@/utils"
import type { TSocketMessage } from "@/types"
import { shouldHideFromCareChat } from "@/lib/careChatFilter"

type CareMessage = {
  id: string
  content: string
  senderId: string
  receiverId?: string | null
  createdAt: string
  type?: string | null
}

type Props = {
  /** Signed-in user UUID (JWT sub). */
  selfUserId: string
  /** Peer doctor or patient UUID. */
  peerUserId: string
  peerName: string
  /** Shown above the thread */
  subtitle?: string
  className?: string
}

function pickUuid(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = String(c ?? "").trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      return s
    }
  }
  for (const c of candidates) {
    const s = String(c ?? "").trim()
    if (s) return s
  }
  return ""
}

function normalizeMsg(raw: Record<string, unknown>): CareMessage {
  const camel = firey.convertKeysToCamelCase(raw) as CareMessage & {
    idUuid?: string
    sender_id?: string
    receiver_id?: string
    created_at?: string
  }
  return {
    id: pickUuid(raw.idUuid, camel.idUuid, raw.id, camel.id),
    content: String(camel.content || raw.content || ""),
    senderId: pickUuid(raw.senderId, camel.senderId, raw.sender_id, camel.sender_id),
    receiverId:
      pickUuid(
        raw.receiverId,
        camel.receiverId,
        raw.receiver_id,
        camel.receiver_id,
      ) || null,
    createdAt: String(
      camel.createdAt || raw.created_at || raw.createdAt || new Date().toISOString(),
    ),
    type: String(camel.type ?? raw.type ?? "direct"),
  }
}

export default function CareChatPanel({
  selfUserId,
  peerUserId,
  peerName,
  subtitle,
  className = "",
}: Props) {
  const [messages, setMessages] = useState<CareMessage[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const token =
    cookies.getCookie("access_token") || cookies.getCookie("refresh_token") || ""

  const socketURL = selfUserId
    ? buildWsUrl(`/api/v1/ws/chats/${selfUserId}`)
    : null
  const { values, isConnected } = useSocket<TSocketMessage>(socketURL, 3000)

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!selfUserId || !peerUserId || !token) return
      if (!opts?.quiet) {
        setLoading(true)
        setError("")
      }
      try {
        const res = await chatService.getUserDirectChats(
          token,
          selfUserId,
          peerUserId,
          "page=1&limit=50",
        )
        const list = Array.isArray(res.messages)
          ? res.messages
          : Array.isArray(res?.data?.messages)
            ? res.data.messages
            : []
        const normalized = list
          .map((m: Record<string, unknown>) => normalizeMsg(m))
          .filter((m: CareMessage) => !shouldHideFromCareChat(m.content))
          .reverse()
        setMessages(normalized)
      } catch (e) {
        if (!opts?.quiet) {
          setError(e instanceof Error ? e.message : "Could not load messages.")
          setMessages([])
        }
      } finally {
        if (!opts?.quiet) setLoading(false)
      }
    },
    [selfUserId, peerUserId, token],
  )

  useEffect(() => {
    void load()
  }, [load])

  // WhatsApp inbound may land while the socket is idle — poll quietly.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ quiet: true })
    }, 4000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!values) return
    const msg = normalizeMsg(values as unknown as Record<string, unknown>)
    if (shouldHideFromCareChat(msg.content)) return
    const involvesPeer =
      msg.senderId === peerUserId ||
      msg.receiverId === peerUserId ||
      msg.senderId === selfUserId ||
      msg.receiverId === selfUserId
    if (!involvesPeer || msg.type !== "direct") return
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [values, peerUserId, selfUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  async function send() {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setError("")
    try {
      const created = await chatService.sendDirectMessage(peerUserId, content)
      const msg = normalizeMsg(created as Record<string, unknown>)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      setDraft("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.")
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <section
      className={`flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
    >
      <header className="border-b border-slate-200 px-4 py-3 dark:border-neutral-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Chat with {peerName}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {subtitle ||
            (isConnected
              ? "Live · WhatsApp replies from the patient appear here too"
              : "Two-way with WhatsApp: clinic texts and patient replies sync here")}
        </p>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-slate-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === selfUserId
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-neutral-800 dark:text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      mine ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleString("en-US", {
                      timeZone: "Asia/Kolkata",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-4 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="border-t border-slate-200 p-3 dark:border-neutral-700">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={4000}
            placeholder={`Message ${peerName}…`}
            className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          />
          <button
            type="button"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
            className="h-11 shrink-0 self-end rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  )
}
