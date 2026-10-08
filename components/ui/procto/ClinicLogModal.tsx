"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { MessageCircle, X } from "lucide-react"
import ClinicLogDocument, {
  type ClinicLogTab,
} from "@/components/ui/procto/ClinicLogDocument"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"

type Props = {
  open: boolean
  bookingId: string | null
  /** Tab shown when the preview opens. */
  initialTab?: ClinicLogTab
  onClose: () => void
}

export default function ClinicLogModal({
  open,
  bookingId,
  initialTab = "visit",
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [booking, setBooking] = useState<ProctoBooking | null>(null)
  const [tab, setTab] = useState<ClinicLogTab>(initialTab)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState("")

  const tabs: { id: ClinicLogTab; label: string }[] = [
    { id: "visit", label: "Visit" },
    { id: "clinical", label: "Clinical" },
    { id: "prescription", label: "Prescription" },
  ]

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open || !bookingId) return
    let cancelled = false
    setLoading(true)
    setError("")
    setBooking(null)
    setNotice("")
    setTab(initialTab)
    void proctoService.getBooking(bookingId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.status !== "successful" || !res.data) {
        setError(res.message || "Could not load clinic log.")
        return
      }
      setBooking(res.data as ProctoBooking)
    })
    return () => {
      cancelled = true
    }
  }, [open, bookingId, initialTab])

  async function sendToCustomer() {
    if (!bookingId || sending) return
    setSending(true)
    setNotice("")
    const res = await proctoService.sendClinicLogWhatsApp(bookingId)
    setSending(false)
    setNotice(
      res.status === "successful"
        ? "Sent to the customer on WhatsApp."
        : res.message || "Could not send via WhatsApp.",
    )
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  const body = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clinic-log-title"
      onClick={onClose}
    >
      <div
        className="relative my-6 w-full max-w-4xl rounded-xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="clinic-log-title"
              className="text-sm font-bold text-neutral-900 dark:text-white"
            >
              Clinic Log and details
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!bookingId || sending || loading}
                onClick={() => void sendToCustomer()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <MessageCircle className="size-3.5" aria-hidden />
                {sending ? "Sending…" : "Send to customer"}
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="inline-flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div
            role="tablist"
            aria-label="Clinic log"
            className="mt-3 flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  tab === item.id
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {notice ? (
            <p className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300" role="status">
              {notice}
            </p>
          ) : null}
        </div>
        <div className="max-h-[min(85vh,900px)] overflow-y-auto print:max-h-none">
          {loading ? (
            <p className="p-8 text-sm text-neutral-500">Loading clinic log…</p>
          ) : error ? (
            <p className="p-8 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : booking ? (
            <ClinicLogDocument booking={booking} tab={tab} />
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(body, dashboardPortalRoot())
}
