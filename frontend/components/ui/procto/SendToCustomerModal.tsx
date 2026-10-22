"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  ClipboardList,
  FileText,
  Files,
  Loader2,
  MessageCircle,
  Phone,
  User,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { dashboardPortalRoot } from "@/lib/portalRoot"
import { proctoService } from "@/lib/services/procto"

export type SendToCustomerKind = "prescription" | "consultation" | "both"

export type SendToCustomerModalProps = {
  open: boolean
  bookingId: string | null
  patientName?: string | null
  patientPhone?: string | null
  initialKind?: SendToCustomerKind
  onClose: () => void
  onSuccess?: (kind: SendToCustomerKind, result: any) => void
  /** Optional callback to save pending edits before generating/sending the PDF. */
  beforeSend?: () => Promise<boolean>
}

export default function SendToCustomerModal({
  open,
  bookingId,
  patientName,
  patientPhone,
  initialKind = "prescription",
  onClose,
  onSuccess,
  beforeSend,
}: SendToCustomerModalProps) {
  const [mounted, setMounted] = useState(false)
  const [selectedKind, setSelectedKind] = useState<SendToCustomerKind>(initialKind)
  const [sending, setSending] = useState(false)
  const [errorNotice, setErrorNotice] = useState("")

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setSelectedKind(initialKind)
      setErrorNotice("")
    }
  }, [open, initialKind])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose, sending])

  if (!open || !mounted || typeof document === "undefined") return null

  const cleanPhone = String(patientPhone || "").trim()

  async function handleSend() {
    if (!bookingId || sending) return
    setErrorNotice("")

    if (beforeSend) {
      try {
        const canProceed = await beforeSend()
        if (!canProceed) return
      } catch (err) {
        setErrorNotice(err instanceof Error ? err.message : "Could not prepare visit data.")
        return
      }
    }

    setSending(true)
    try {
      const res = await proctoService.sendClinicLogWhatsApp(bookingId, selectedKind)
      if (res.status !== "successful") {
        const msg = res.message || "Failed to send documents via WhatsApp."
        setErrorNotice(msg)
        toast.error(msg)
        setSending(false)
        return
      }

      const successLabel =
        selectedKind === "both"
          ? "Prescription and Consultation PDFs sent on WhatsApp."
          : selectedKind === "consultation"
          ? "Consultation report sent on WhatsApp."
          : "Prescription PDF sent on WhatsApp."

      toast.success(successLabel)
      onSuccess?.(selectedKind, res.data)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred."
      setErrorNotice(msg)
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  const options: Array<{
    id: SendToCustomerKind
    title: string
    badge: string
    description: string
    icon: typeof FileText
    iconColor: string
    borderColor: string
    badgeColor: string
  }> = [
    {
      id: "prescription",
      title: "Prescription (Rx)",
      badge: "Rx PDF",
      description:
        "Official prescription document with prescribed medicines, dosage, timing, duration, and instructions.",
      icon: FileText,
      iconColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
      borderColor: "border-emerald-500",
      badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    },
    {
      id: "consultation",
      title: "Consultation Summary",
      badge: "Visit Report PDF",
      description:
        "Comprehensive clinical report covering vitals, chief complaints, pain, allergies, diagnosis, doctor notes, and medicines.",
      icon: ClipboardList,
      iconColor: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40",
      borderColor: "border-teal-500",
      badgeColor: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
    },
    {
      id: "both",
      title: "Both Documents",
      badge: "Prescription & Consultation",
      description:
        "Delivers both the standalone Prescription and the comprehensive Consultation summary as two separate PDFs on WhatsApp.",
      icon: Files,
      iconColor: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40",
      borderColor: "border-sky-500",
      badgeColor: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    },
  ]

  const modalContent = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-to-customer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <h2
                id="send-to-customer-title"
                className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
              >
                Send to Customer
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Choose the visit document to deliver directly via WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Recipient summary badge */}
        <div className="border-b border-neutral-100 bg-neutral-50/80 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200">
              <User className="size-3.5 text-neutral-500" />
              <span>{patientName?.trim() || "Patient"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <Phone className="size-3.5 text-emerald-600" />
              <span className="font-mono font-medium">
                {cleanPhone || "No phone number available"}
              </span>
            </div>
          </div>
        </div>

        {/* Document Selection Options */}
        <div className="space-y-3 px-6 py-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Select Document to Send
          </label>
          <div className="space-y-2.5">
            {options.map((opt) => {
              const Icon = opt.icon
              const isSelected = selectedKind === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedKind(opt.id)}
                  disabled={sending}
                  className={`group relative flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition ${
                    isSelected
                      ? `border-emerald-500 bg-emerald-500/[0.04] ring-1 ring-emerald-500 dark:border-emerald-400 dark:bg-emerald-500/[0.08]`
                      : `border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/60 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/50`
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${opt.iconColor}`}
                  >
                    <Icon className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {opt.title}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${opt.badgeColor}`}
                      >
                        {opt.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {opt.description}
                    </p>
                  </div>

                  {/* Radio Indicator */}
                  <div
                    className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border transition ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                        : "border-neutral-300 bg-white group-hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800"
                    }`}
                  >
                    {isSelected ? <Check className="size-3 stroke-[2.5]" /> : null}
                  </div>
                </button>
              )
            })}
          </div>

          {errorNotice ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {errorNotice}
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900/80">
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending || !bookingId}
            onClick={() => void handleSend()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <MessageCircle className="size-4" />
                <span>Send on WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, dashboardPortalRoot())
}

