"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import {
  assistantService,
  type AssistantChatMessage,
  type AssistantConversationSummary,
} from "@/lib/services/assistant"
import { isMiraBotPath } from "@/lib/miraBotVisibility"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import MicButton from "@/components/inputs/MicButton"

type UiMessage = AssistantChatMessage & { id: string; animate?: boolean }

const WELCOME = "Hi — how can I help?"

function welcomeMessages(): UiMessage[] {
  return [{ id: "welcome", role: "assistant", content: WELCOME }]
}

function BotGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 8V5" />
      <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M9 16.5h6" />
    </svg>
  )
}

function HistoryGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function NewChatGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/** Reveal text at a human-ish typing pace. */
function TypedText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState("")
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
    setShown("")
    let i = 0
    const tick = () => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) {
        if (!doneRef.current) {
          doneRef.current = true
          onDone?.()
        }
        return
      }
      const ch = text[i - 1]
      const delay = ch === " " ? 12 : ch === "." || ch === "?" || ch === "!" ? 90 : 22
      timer = window.setTimeout(tick, delay)
    }
    let timer = window.setTimeout(tick, 40)
    return () => window.clearTimeout(timer)
  }, [text, onDone])

  return (
    <span>
      {shown}
      {shown.length < text.length ? (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-current align-middle opacity-60" />
      ) : null}
    </span>
  )
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export default function GlucoBot() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<UiMessage[]>(welcomeMessages)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState("Mira")
  const [panel, setPanel] = useState<"chat" | "history">("chat")
  const [history, setHistory] = useState<AssistantConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const baseInputRef = useRef("")
  const conversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  const {
    listening,
    processing,
    error: voiceError,
    toggle: toggleVoice,
    stop: stopVoice,
    clearError: clearVoiceError,
  } = useSpeechRecognition({
    continuous: true,
    liveTranscript: true,
    onInterimTranscript: (text) => {
      const base = baseInputRef.current
      setInput(base ? `${base} ${text}` : text)
    },
    onFinalTranscript: (text) => {
      if (!text) return
      setInput(() => {
        const base = baseInputRef.current.trim()
        const merged = base ? `${base} ${text}` : text
        baseInputRef.current = merged
        return merged
      })
      inputRef.current?.focus()
    },
  })

  useEffect(() => {
    if (!open) stopVoice()
  }, [open, stopVoice])

  useEffect(() => {
    setMounted(true)
  }, [])

  const showWidget = mounted && isMiraBotPath(pathname)

  useEffect(() => {
    if (!showWidget) setOpen(false)
  }, [showWidget])

  useEffect(() => {
    let cancelled = false
    assistantService.status().then((res) => {
      if (cancelled) return
      setAvailable(Boolean(res.data?.available))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open || panel !== "chat") return
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    })
    inputRef.current?.focus()
  }, [open, messages, busy, panel])

  const startNewChat = useCallback(() => {
    stopVoice()
    setPanel("chat")
    setConversationId(null)
    conversationIdRef.current = null
    setConversationTitle("Mira")
    setMessages(welcomeMessages())
    setInput("")
    baseInputRef.current = ""
    setHistoryError(null)
  }, [stopVoice])

  const openHistory = useCallback(async () => {
    stopVoice()
    setPanel("history")
    setHistoryLoading(true)
    setHistoryError(null)
    const res = await assistantService.listConversations()
    setHistoryLoading(false)
    if (res.status !== "successful") {
      setHistory([])
      setHistoryError(
        res.message?.toLowerCase().includes("sign in")
          ? "Sign in to see saved chats."
          : res.message || "Could not load chat history.",
      )
      return
    }
    setHistory(res.data ?? [])
  }, [stopVoice])

  const openConversation = useCallback(async (id: string) => {
    setHistoryLoading(true)
    setHistoryError(null)
    const res = await assistantService.getConversation(id)
    setHistoryLoading(false)
    if (res.status !== "successful" || !res.data) {
      setHistoryError(res.message || "Could not open that chat.")
      return
    }
    setConversationId(res.data.id)
    conversationIdRef.current = res.data.id
    setConversationTitle(res.data.title || "Mira")
    setMessages(
      res.data.messages.length
        ? res.data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
        : welcomeMessages(),
    )
    setPanel("chat")
  }, [])

  const removeConversation = useCallback(
    async (id: string) => {
      const res = await assistantService.deleteConversation(id)
      if (res.status !== "successful") return
      setHistory((prev) => prev.filter((c) => c.id !== id))
      if (conversationIdRef.current === id) startNewChat()
    },
    [startNewChat],
  )

  async function send() {
    const text = input.trim()
    if (!text || busy) return

    setInput("")
    baseInputRef.current = ""
    stopVoice()
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    }
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)

    const historyForModel = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .map(({ role, content }) => ({ role, content }))

    const res = await assistantService.chat(
      text,
      historyForModel,
      conversationIdRef.current,
    )
    setBusy(false)

    if (res.status !== "successful" || !res.data?.reply) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            res.message?.trim() ||
            "Sorry, that didn’t go through. Try again in a sec.",
          animate: true,
        },
      ])
      return
    }

    if (res.data.conversationId) {
      setConversationId(res.data.conversationId)
      conversationIdRef.current = res.data.conversationId
    }
    if (res.data.title) setConversationTitle(res.data.title)

    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.data!.reply,
        animate: true,
      },
    ])
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  if (!showWidget) return null

  const widget = (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[120] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <div className="pointer-events-auto flex h-[min(520px,68dvh)] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/15 dark:border-neutral-700 dark:bg-[#141414]">
          <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-700">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)]">
                <BotGlyph className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                  {panel === "history" ? "Chat history" : conversationTitle}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span
                    className={`size-1.5 rounded-full ${
                      available === false ? "bg-neutral-400" : "bg-emerald-500"
                    }`}
                  />
                  {panel === "history"
                    ? "Previous Mira chats"
                    : available === false
                      ? "Away"
                      : "Online"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {panel === "history" ? (
                <button
                  type="button"
                  onClick={() => setPanel("chat")}
                  className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                  aria-label="Back to chat"
                  title="Back to chat"
                >
                  <BotGlyph className="size-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void openHistory()}
                    className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                    aria-label="Open chat history"
                    title="History"
                  >
                    <HistoryGlyph className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                    aria-label="Start new chat"
                    title="New chat"
                  >
                    <NewChatGlyph className="size-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-9 rounded-lg px-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                aria-label="Close chat"
              >
                Close
              </button>
            </div>
          </header>

          {panel === "history" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {historyLoading ? (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    Loading…
                  </p>
                ) : historyError ? (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500">
                    {historyError}
                  </p>
                ) : history.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500">
                    No saved chats yet. Send a message and it will show up here.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((item) => (
                      <li key={item.id}>
                        <div className="flex items-start gap-1 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-white/5">
                          <button
                            type="button"
                            onClick={() => void openConversation(item.id)}
                            className="min-w-0 flex-1 px-3 py-2.5 text-left"
                          >
                            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                              {item.title}
                            </p>
                            {item.preview ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400">
                                {item.preview}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] font-medium text-neutral-400">
                              {formatWhen(item.updatedAt)}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeConversation(item.id)}
                            className="m-1 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                            aria-label="Delete chat"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-white/5"
                >
                  New chat
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={scroller}
                className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] px-3.5 py-2 text-[15px] leading-snug ${
                        m.role === "user"
                          ? "rounded-2xl rounded-br-md bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)]"
                          : "rounded-2xl rounded-bl-md bg-neutral-100 text-neutral-800 dark:bg-white/10 dark:text-neutral-100"
                      }`}
                    >
                      {m.role === "assistant" && m.animate ? (
                        <TypedText text={m.content} />
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))}
                {busy ? (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-neutral-100 px-3.5 py-2.5 dark:bg-white/10">
                      <span className="inline-flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:0ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
                {processing ? (
                  <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Transcribing…
                  </p>
                ) : listening ? (
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                    </span>
                    Listening… speak your message
                  </p>
                ) : null}
                {voiceError ? (
                  <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    {voiceError}
                  </p>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      clearVoiceError()
                      baseInputRef.current = e.target.value
                      setInput(e.target.value)
                    }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Message…"
                    disabled={busy || available === false}
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none ring-[var(--theme-primary)] focus:ring-2 disabled:opacity-60 dark:border-neutral-600 dark:bg-[#0f0f0f] dark:text-white"
                  />
                  <MicButton
                    listening={listening || processing}
                    disabled={busy || available === false || processing}
                    onClick={() => {
                      clearVoiceError()
                      if (!listening) baseInputRef.current = input.trim()
                      toggleVoice()
                    }}
                    ariaLabel="Record voice message"
                    className="rounded-xl dark:border-neutral-600 dark:hover:bg-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={busy || !input.trim() || available === false}
                    className="min-h-11 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                  >
                    Send
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Tap the mic to dictate — review the text, then send.
                </p>
              </div>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition hover:scale-105 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus-visible:ring-offset-[#090909]"
        aria-label={open ? "Close Mira chat" : "Open Mira chat"}
        aria-expanded={open}
      >
        {open ? (
          <span className="text-2xl leading-none">×</span>
        ) : (
          <BotGlyph className="size-7" />
        )}
      </button>
    </div>
  )

  return createPortal(widget, document.body)
}
