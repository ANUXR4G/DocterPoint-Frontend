"use client"

import { useEffect, useRef, useState } from "react"
import { ClipboardPlus, Eye, MessageCircle } from "lucide-react"
import ClinicLogModal from "@/components/ui/procto/ClinicLogModal"
import { proctoService } from "@/lib/services/procto"

type Props = {
  bookingId: string
  /** Only finished visits expose the clinic log / Rx menu. */
  enabled: boolean
  className?: string
}

/**
 * Outer-column prescription control for COMPLETED visits:
 * icon → View clinic log | Send to customer (Via WhatsApp).
 */
export default function PrescriptionActionsMenu({
  bookingId,
  enabled,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  if (!enabled) return null

  async function sendWhatsApp() {
    setSending(true)
    setNotice("")
    const res = await proctoService.sendClinicLogWhatsApp(bookingId)
    setSending(false)
    setOpen(false)
    if (res.status !== "successful") {
      setNotice(res.message || "Could not send via WhatsApp.")
      return
    }
    setNotice("Clinic log / prescription sent to patient WhatsApp.")
  }

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        title="Prescription / clinic log"
        aria-label="Prescription / clinic log"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setNotice("")
          setOpen((v) => !v)
        }}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
      >
        <ClipboardPlus className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[220px] rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => {
              setOpen(false)
              setViewOpen(true)
            }}
          >
            <Eye className="size-4 shrink-0 text-teal-600" aria-hidden />
            View
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={sending}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => void sendWhatsApp()}
          >
            <MessageCircle
              className="size-4 shrink-0 text-emerald-600"
              aria-hidden
            />
            {sending ? "Sending…" : "Send to customer (Via WhatsApp)"}
          </button>
        </div>
      ) : null}

      {notice ? (
        <span className="sr-only" role="status">
          {notice}
        </span>
      ) : null}

      {notice && !open ? (
        <p
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-medium text-neutral-700 shadow dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <ClinicLogModal
        open={viewOpen}
        bookingId={viewOpen ? bookingId : null}
        onClose={() => setViewOpen(false)}
      />
    </div>
  )
}
