"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { chatService } from "@/lib/services/chat"
import { useSocket } from "@/hooks/useSocket"
import { buildWsUrl } from "@/lib/wsOrigin"
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
  /** Hide title row when the parent already provides one (e.g. modal). */
  showHeader?: boolean
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

function byTime(a: CareMessage, b: CareMessage) {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/** Server page wins; keep local rows newer than it (socket / send landed mid-fetch). */
function mergeThread(server: CareMessage[], local: CareMessage[]): CareMessage[] {
  const ids = new Set(server.map((m) => m.id))
  const newest = server.length ? Date.parse(server[server.length - 1].createdAt) : 0
  const extra = local.filter(
    (m) => !ids.has(m.id) && Date.parse(m.createdAt) >= newest,
  )
  return extra.length ? [...server, ...extra].sort(byTime) : server
}

function addOnce(list: CareMessage[], msg: CareMessage): CareMessage[] {
  if (list.some((m) => m.id === msg.id)) return list
  return [...list, msg].sort(byTime)
}

type PendingMessage = {
  tempId: string
  content: string
  createdAt: string
  status: "sending" | "failed"
  error?: string
}

const POLL_MS = 4000

export default function CareChatPanel({
  selfUserId,
  peerUserId,
  peerName,
  subtitle,
  showHeader = true,
  className = "",
}: Props) {
  const [messages, setMessages] = useState<CareMessage[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [syncError, setSyncError] = useState("")
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastScrollKey = useRef("")
  const loadSeq = useRef(0)
  const polling = useRef(false)

  const socketURL = selfUserId
    ? buildWsUrl(`/api/v1/ws/chats/${selfUserId}`)
    : null
  const { values, isConnected } = useSocket<TSocketMessage>(socketURL, 3000)

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!selfUserId || !peerUserId) return
      const seq = ++loadSeq.current
      if (!opts?.quiet) {
        setLoading(true)
        setLoadError("")
      }
      try {
        const res = await chatService.getUserDirectChats(
          "",
          selfUserId,
          peerUserId,
          "page=1&limit=50",
        )
        if (seq !== loadSeq.current) return
        const list = Array.isArray(res.messages)
          ? res.messages
          : Array.isArray(res?.data?.messages)
            ? res.data.messages
            : []
        const server = list
          .map((m: Record<string, unknown>) => normalizeMsg(m))
          .reverse()
        setMessages((prev) => mergeThread(server, prev))
        setLoadError("")
        setSyncError("")
      } catch (e) {
        if (seq !== loadSeq.current) return
        const msg = e instanceof Error ? e.message : "Could not load messages."
        if (opts?.quiet) setSyncError(msg)
        else setLoadError(msg)
      } finally {
        if (!opts?.quiet && seq === loadSeq.current) setLoading(false)
      }
    },
    [selfUserId, peerUserId],
  )

  useEffect(() => {
    setMessages([])
    setPending([])
    setSyncError("")
    lastScrollKey.current = ""
    void load()
  }, [load])

  // WhatsApp inbound may land while the socket is idle — poll quietly.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden || polling.current) return
      polling.current = true
      void load({ quiet: true }).finally(() => {
        polling.current = false
      })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!values) return
    const msg = normalizeMsg(values as unknown as Record<string, unknown>)
    const inThread =
      (msg.senderId === peerUserId && msg.receiverId === selfUserId) ||
      (msg.senderId === selfUserId && msg.receiverId === peerUserId)
    if (!inThread || msg.type !== "direct") return
    setMessages((prev) => addOnce(prev, msg))
  }, [values, peerUserId, selfUserId])

  // Staff / patient own texts always show; the filter only drops WhatsApp bot
  // menu noise coming from the other side.
  const visible = messages.filter(
    (m) =>
      m.content.trim() &&
      (m.senderId === selfUserId || !shouldHideFromCareChat(m.content)),
  )

  useEffect(() => {
    // Key on the newest row, not the count — the thread is capped at 50, so a
    // new message can arrive without the length changing.
    const last = pending.length
      ? `p:${pending[pending.length - 1].tempId}:${pending[pending.length - 1].status}`
      : visible.length
        ? `m:${visible[visible.length - 1].id}`
        : ""
    if (!last || last === lastScrollKey.current) return
    const first = lastScrollKey.current === ""
    lastScrollKey.current = last
    const el = listRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" })
    })
  }, [visible, pending])

  async function deliver(item: PendingMessage) {
    setPending((prev) =>
      prev.map((p) =>
        p.tempId === item.tempId ? { ...p, status: "sending", error: undefined } : p,
      ),
    )
    try {
      const created = await chatService.sendDirectMessage(peerUserId, item.content)
      const msg = normalizeMsg(created as Record<string, unknown>)
      setMessages((prev) => addOnce(prev, msg))
      setPending((prev) => prev.filter((p) => p.tempId !== item.tempId))
    } catch (e) {
      setPending((prev) =>
        prev.map((p) =>
          p.tempId === item.tempId
            ? {
                ...p,
                status: "failed",
                error: e instanceof Error ? e.message : "Send failed.",
              }
            : p,
        ),
      )
    }
  }

  function send() {
    const content = draft.trim()
    if (!content || !selfUserId || !peerUserId) return
    const item: PendingMessage = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      createdAt: new Date().toISOString(),
      status: "sending",
    }
    setPending((prev) => [...prev, item])
    setDraft("")
    void deliver(item)
  }

  function discard(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId))
  }

  const anySending = pending.some((p) => p.status === "sending")

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const shellClass = showHeader
    ? "rounded-2xl border border-slate-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    : "bg-transparent"

  return (
    <section
      className={`flex min-h-[22rem] flex-col overflow-hidden ${shellClass} ${className}`}
    >
      {showHeader ? (
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
      ) : null}

      {syncError && !loadError ? (
        <p
          className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
        >
          {syncError} Retrying…
        </p>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3"
        aria-live="polite"
      >
        {loading && visible.length === 0 ? (
          <p className="text-sm text-slate-500">Loading messages…</p>
        ) : loadError && visible.length === 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Try again
            </button>
          </div>
        ) : visible.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          visible.map((m) => {
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
        {pending.map((p) => (
          <div key={p.tempId} className="flex flex-col items-end">
            <div
              className={`max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-sm text-white ${
                p.status === "failed" ? "bg-red-500/90" : "bg-blue-600/70"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{p.content}</p>
              <p className="mt-1 text-[10px] text-blue-100">
                {p.status === "sending" ? "Sending…" : "Not sent"}
              </p>
            </div>
            {p.status === "failed" ? (
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="text-red-600 dark:text-red-400">{p.error}</span>
                <button
                  type="button"
                  onClick={() => void deliver(p)}
                  className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => discard(p.tempId)}
                  className="font-semibold text-slate-500 hover:underline"
                >
                  Discard
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {loadError && visible.length > 0 ? (
        <p className="px-4 text-xs text-red-600 dark:text-red-400">{loadError}</p>
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
            disabled={!draft.trim()}
            onClick={send}
            className="h-11 shrink-0 self-end rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {anySending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  )
}
