"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import ClinicLogDocument from "@/components/ui/procto/ClinicLogDocument"
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

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open || !bookingId) return
    let cancelled = false
    setLoading(true)
    setError("")
    setBooking(null)
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
  }, [open, bookingId])

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
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
          <h2
            id="clinic-log-title"
            className="text-sm font-bold text-neutral-900 dark:text-white"
          >
            Clinic Log and details
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200"
            >
              Print
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
        <div className="max-h-[min(85vh,900px)] overflow-y-auto print:max-h-none">
          {loading ? (
            <p className="p-8 text-sm text-neutral-500">Loading clinic log…</p>
          ) : error ? (
            <p className="p-8 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : booking ? (
            <ClinicLogDocument booking={booking} />
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(body, dashboardPortalRoot())
}
