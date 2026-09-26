"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { MessageCircle, X } from "lucide-react"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { getSessionUserId } from "@/lib/sessionUser"

type Props = {
  open: boolean
  patientName?: string | null
  /** Registered patient account UUID — required for care chat. */
  peerUserId?: string | null
  onClose: () => void
}

/** Doctor ↔ patient care chat in a centered modal (same thread as visit detail). */
export default function AppointmentChatModal({
  open,
  patientName,
  peerUserId,
  onClose,
}: Props) {
  const selfId = getSessionUserId()
  const peerId = peerUserId?.trim() || ""
  const displayName = patientName?.trim() || "Patient"

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appointment-chat-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
          <div className="min-w-0">
            <h2
              id="appointment-chat-title"
              className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white"
            >
              <MessageCircle
                className="size-5 shrink-0 text-[var(--theme-primary)]"
                aria-hidden
              />
              <span className="truncate">Chat · {displayName}</span>
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Patient WhatsApp replies also appear here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Close chat"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selfId && peerId ? (
            <CareChatPanel
              className="min-h-[min(70vh,28rem)] flex-1 border-0"
              showHeader={false}
              selfUserId={selfId}
              peerUserId={peerId}
              peerName={displayName}
              subtitle="Patient WhatsApp replies also appear here."
            />
          ) : (
            <div className="px-5 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {!selfId
                ? "Sign in again to open chat."
                : "Chat is available when this visit is linked to a registered patient account."}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
