"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Download, MessageCircle, X } from "lucide-react"
import PrescriptionSheet from "@/components/ui/procto/PrescriptionSheet"
import {
  buildPrescriptionPdf,
  prescriptionBlob,
  prescriptionFileName,
} from "@/lib/prescriptionPdf"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"

type Props = {
  open: boolean
  bookingId: string | null
  onClose: () => void
}

export default function ClinicLogModal({ open, bookingId, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [booking, setBooking] = useState<ProctoBooking | null>(null)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open || !bookingId) return
    let cancelled = false
    setLoading(true)
    setError("")
    setBooking(null)
    setNotice("")
    void proctoService.getBooking(bookingId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.status !== "successful" || !res.data) {
        setError(res.message || "Could not load the prescription.")
        return
      }
      setBooking(res.data as ProctoBooking)
    })
    return () => {
      cancelled = true
    }
  }, [open, bookingId])

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

  async function downloadPdf() {
    if (!booking || saving) return
    setSaving(true)
    setNotice("")
    try {
      const bytes = await buildPrescriptionPdf(booking)
      const blob = prescriptionBlob(bytes)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = prescriptionFileName(booking)
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setNotice("Could not create the prescription PDF.")
    } finally {
      setSaving(false)
    }
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
        className="relative my-6 w-full max-w-4xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h2 id="clinic-log-title" className="text-sm font-bold text-neutral-900">
              Prescription
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!booking || saving || loading}
                onClick={() => void downloadPdf()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              >
                <Download className="size-3.5" aria-hidden />
                {saving ? "Saving…" : "Download PDF"}
              </button>
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
                className="inline-flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          {notice ? (
            <p className="mt-2 text-xs font-medium text-neutral-600" role="status">
              {notice}
            </p>
          ) : null}
        </div>
        <div className="max-h-[min(85vh,900px)] overflow-y-auto">
          {loading ? (
            <p className="p-8 text-sm text-neutral-500">Loading prescription…</p>
          ) : error ? (
            <p className="p-8 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : booking ? (
            <PrescriptionSheet booking={booking} />
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(body, dashboardPortalRoot())
}
