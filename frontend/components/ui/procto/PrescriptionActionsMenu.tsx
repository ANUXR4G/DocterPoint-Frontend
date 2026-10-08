"use client"

import { useEffect, useRef, useState } from "react"
import { ClipboardPlus, Eye, MessageCircle } from "lucide-react"
import ClinicLogModal from "@/components/ui/procto/ClinicLogModal"
import type { ClinicLogTab } from "@/components/ui/procto/ClinicLogDocument"
import { proctoService } from "@/lib/services/procto"

type Props = {
  bookingId: string
  /** Only finished visits expose the clinic log / Rx menu. */
  enabled: boolean
  /** Match the short queue action buttons. */
  compact?: boolean
  /** Icon menu on lists, or the three labeled buttons on the visit. */
  layout?: "menu" | "buttons"
  className?: string
}

/**
 * Outer-column prescription control for COMPLETED visits:
 * icon → Preview Rx | Preview Prescription | Send to customer.
 */
export default function PrescriptionActionsMenu({
  bookingId,
  enabled,
  compact = false,
  layout = "menu",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [previewTab, setPreviewTab] = useState<ClinicLogTab>("visit")
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

  function openPreview(tab: ClinicLogTab) {
    setPreviewTab(tab)
    setViewOpen(true)
    setOpen(false)
    setNotice("")
  }

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

  const preview = (
    <ClinicLogModal
      open={viewOpen}
      bookingId={viewOpen ? bookingId : null}
      initialTab={previewTab}
      onClose={() => setViewOpen(false)}
    />
  )

  if (layout === "buttons") {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={() => openPreview("visit")}
          className="inline-flex h-9 items-center rounded-full border border-teal-600/30 bg-teal-600/10 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-600/20 dark:text-teal-200"
        >
          Preview Rx
        </button>
        <button
          type="button"
          onClick={() => openPreview("prescription")}
          className="inline-flex h-9 items-center rounded-full border border-sky-600/30 bg-sky-600/10 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-600/20 dark:text-sky-200"
        >
          Preview Prescription
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => void sendWhatsApp()}
          className="inline-flex h-9 items-center rounded-full bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send to customer"}
        </button>
        {notice ? (
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300" role="status">
            {notice}
          </p>
        ) : null}
        {preview}
      </div>
    )
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
        className={`inline-flex items-center justify-center border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300 ${
          compact ? "size-7 rounded-md" : "size-9 rounded-xl"
        }`}
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
            onClick={() => openPreview("visit")}
          >
            <Eye className="size-4 shrink-0 text-teal-600" aria-hidden />
            Preview Rx
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={() => openPreview("prescription")}
          >
            <Eye className="size-4 shrink-0 text-sky-600" aria-hidden />
            Preview Prescription
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

      {preview}
    </div>
  )
}
