"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Download, Loader2, MessageCircle, X } from "lucide-react"
import { toast } from "sonner"
import ConsultationSheet from "@/components/ui/procto/ConsultationSheet"
import PrescriptionSheet from "@/components/ui/procto/PrescriptionSheet"
import DiagnosticOrderSheet from "@/components/ui/procto/DiagnosticOrderSheet"
import {
  buildConsultationPdf,
  consultationFileName,
} from "@/lib/consultationPdf"
import {
  buildPrescriptionPdf,
  prescriptionBlob,
  prescriptionFileName,
} from "@/lib/prescriptionPdf"
import {
  buildDiagnosticOrderPdf,
  diagnosticOrderBlob,
  diagnosticOrderFileName,
} from "@/lib/diagnosticOrderPdf"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"

type PrintKind = "consultation" | "prescription" | "diagnostics"

type Props = {
  open: boolean
  bookingId: string | null
  onClose: () => void
  /** Which sheet opens first. All print kinds stay available in the preview. */
  initialKind?: PrintKind
  bookingData?: ProctoBooking | null
}

export default function ClinicLogModal({
  open,
  bookingId,
  onClose,
  initialKind = "consultation",
  bookingData,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [booking, setBooking] = useState<ProctoBooking | null>(bookingData || null)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [kind, setKind] = useState<PrintKind>(initialKind)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    if (!bookingId && !bookingData) return
    let cancelled = false
    setError("")
    setNotice("")
    setKind(initialKind)
    if (bookingData) {
      setBooking(bookingData)
      setLoading(false)
    } else {
      setLoading(true)
      setBooking(null)
    }
    if (bookingId) {
      void Promise.all([
        proctoService.getBooking(bookingId),
        proctoService.getMyPractices(),
      ]).then(([res, practicesRes]) => {
        if (cancelled) return
        setLoading(false)
        if (res.status !== "successful" || !res.data) {
          if (!bookingData) {
            setError(res.message || "Could not load the prescription.")
          }
          return
        }
        const row = res.data as ProctoBooking
        const practices =
          practicesRes.status === "successful" && Array.isArray(practicesRes.data)
            ? practicesRes.data
            : []
        const rowPracticeId =
          (row as { practiceId?: string }).practiceId || row.practice?.id
        const practiceRow = practices.find(
          (m: { practice?: { id?: string } }) =>
            m.practice?.id && m.practice.id === rowPracticeId,
        )?.practice as
          | {
              id?: string
              bgSrc?: string | null
              stampSrc?: string | null
              phone?: string | null
              email?: string | null
              name?: string | null
              members?: Array<{
                userId: string
                user?: {
                  doctor?: { stampSrc?: string | null } | null
                }
              }>
            }
          | undefined

        const providerId =
          (row as { providerId?: string }).providerId || row.provider?.id
        const memberStamp = providerId
          ? practiceRow?.members?.find((m) => m.userId === providerId)?.user
              ?.doctor?.stampSrc ?? null
          : null

        setBooking({
          ...row,
          practice: {
            ...(row.practice || { name: "Clinic" }),
            name: row.practice?.name || practiceRow?.name || "Clinic",
            bgSrc: row.practice?.bgSrc || practiceRow?.bgSrc || null,
            stampSrc: row.practice?.stampSrc || practiceRow?.stampSrc || null,
            phone: row.practice?.phone || practiceRow?.phone || null,
            email: row.practice?.email || practiceRow?.email || null,
          },
          provider: row.provider
            ? {
                ...row.provider,
                stampSrc: row.provider.stampSrc || memberStamp || null,
              }
            : row.provider,
        } as ProctoBooking)
      })
    }
    return () => {
      cancelled = true
    }
  }, [open, bookingId, initialKind, bookingData])

  async function sendToCustomer() {
    if (!bookingId || sending || kind === "diagnostics") return
    setSending(true)
    setNotice("")
    try {
      const res = await proctoService.sendClinicLogWhatsApp(
        bookingId,
        kind === "consultation" ? "consultation" : "prescription",
      )
      if (res.status === "successful") {
        const msg =
          kind === "consultation"
            ? "Consultation note sent to customer on WhatsApp."
            : "Prescription sent to customer on WhatsApp."
        setNotice(msg)
        toast.success(msg)
      } else {
        const err = res.message || "Could not send via WhatsApp."
        setNotice(err)
        toast.error(err)
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : "Failed to send to customer."
      setNotice(err)
      toast.error(err)
    } finally {
      setSending(false)
    }
  }

  async function downloadPdf() {
    if (!booking || saving) return
    setSaving(true)
    setNotice("")
    try {
      const bytes =
        kind === "consultation"
          ? await buildConsultationPdf(booking)
          : kind === "diagnostics"
            ? await buildDiagnosticOrderPdf(booking)
            : await buildPrescriptionPdf(booking)
      const blob =
        kind === "diagnostics" ? diagnosticOrderBlob(bytes) : prescriptionBlob(bytes)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download =
        kind === "consultation"
          ? consultationFileName(booking)
          : kind === "diagnostics"
            ? diagnosticOrderFileName(booking)
            : prescriptionFileName(booking)
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setNotice(
        kind === "consultation"
          ? "Could not create the consultation PDF."
          : kind === "diagnostics"
            ? "Could not create the diagnostic order PDF."
            : "Could not create the prescription PDF.",
      )
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
              {kind === "consultation"
                ? "Consultation"
                : kind === "diagnostics"
                  ? "Diagnostic Order"
                  : "Prescription"}
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-neutral-300 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setKind("consultation")
                    setNotice("")
                  }}
                  className={`rounded-full px-3 py-1 ${kind === "consultation" ? "bg-neutral-900 text-white" : "text-neutral-700"}`}
                >
                  Consultation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind("prescription")
                    setNotice("")
                  }}
                  className={`rounded-full px-3 py-1 ${kind === "prescription" ? "bg-neutral-900 text-white" : "text-neutral-700"}`}
                >
                  Prescription
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKind("diagnostics")
                    setNotice("")
                  }}
                  className={`rounded-full px-3 py-1 ${kind === "diagnostics" ? "bg-neutral-900 text-white" : "text-neutral-700"}`}
                >
                  Diagnostics
                </button>
              </div>
              <button
                type="button"
                disabled={!booking || saving || loading}
                onClick={() => void downloadPdf()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              >
                <Download className="size-3.5" aria-hidden />
                {saving
                  ? "Saving…"
                  : kind === "consultation"
                    ? "Download consultation"
                    : kind === "diagnostics"
                      ? "Download diagnostic order"
                      : "Download prescription"}
              </button>
              <button
                type="button"
                disabled={!bookingId || sending || loading || kind === "diagnostics"}
                onClick={() => void sendToCustomer()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                title={
                  kind === "diagnostics"
                    ? "WhatsApp send for diagnostic orders coming soon"
                    : kind === "consultation"
                      ? "Send consultation note to customer on WhatsApp"
                      : "Send prescription to customer on WhatsApp"
                }
              >
                {sending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Sending…
                  </>
                ) : (
                  <>
                    <MessageCircle className="size-3.5" aria-hidden />
                    Send to customer
                  </>
                )}
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
            <p className="p-8 text-sm text-neutral-500">
              {kind === "consultation"
                ? "Loading consultation…"
                : kind === "diagnostics"
                  ? "Loading diagnostic order…"
                  : "Loading prescription…"}
            </p>
          ) : error ? (
            <p className="p-8 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : booking ? (
            kind === "consultation" ? (
              <ConsultationSheet booking={booking} />
            ) : kind === "diagnostics" ? (
              <DiagnosticOrderSheet booking={booking} />
            ) : (
              <PrescriptionSheet booking={booking} />
            )
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(body, dashboardPortalRoot())
}
