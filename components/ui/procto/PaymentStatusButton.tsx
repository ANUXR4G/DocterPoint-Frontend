"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react"
import PopupModal from "@/components/modals/Modal"
import { proctoService } from "@/lib/services/procto"
import { formatPracticeDateTime } from "@/lib/practiceTime"

type PaymentInfo = {
  status: string | null
  amount: number | null
  linkUrl: string | null
  paymentId: string | null
  paidAt: string | null
  clinicFee: number | null
}

const STATUS: Record<string, { label: string; className: string }> = {
  PAID: {
    label: "Paid",
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  PENDING: {
    label: "Payment pending",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  },
  DECLINED: {
    label: "Pay at clinic",
    className:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200",
  },
  EXPIRED: {
    label: "Link expired",
    className:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
  },
  CANCELLED: {
    label: "Link cancelled",
    className:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
  },
}

const NOT_REQUESTED = {
  label: "Not requested",
  className:
    "border-neutral-300 bg-white text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300",
}

export function paymentStatusLabel(status: string | null | undefined): string {
  return (status && STATUS[status]?.label) || NOT_REQUESTED.label
}

function rupees(paise: number | null | undefined): string {
  if (paise == null) return "—"
  const r = paise / 100
  return `₹${Number.isInteger(r) ? r : r.toFixed(2)}`
}

export default function PaymentStatusButton({
  bookingId,
  status,
  amount,
  compact = false,
  onUpdate,
}: {
  bookingId: string
  status?: string | null
  amount?: number | null
  compact?: boolean
  onUpdate?: (patch: {
    paymentStatus: string | null
    paymentAmount: number | null
    paidAt: string | null
  }) => void
}) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const current = open && info ? info.status : (status ?? null)
  const style = (current && STATUS[current]) || NOT_REQUESTED
  const shownAmount = open && info ? info.amount : amount

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true)
      setError("")
      const res = await proctoService.getBookingPayment(bookingId, refresh)
      setLoading(false)
      if (res.status !== "successful" || !res.data) {
        setError(res.message || "Could not load payment status.")
        return
      }
      const data = res.data as PaymentInfo
      setInfo(data)
      onUpdateRef.current?.({
        paymentStatus: data.status,
        paymentAmount: data.amount,
        paidAt: data.paidAt,
      })
    },
    [bookingId],
  )

  useEffect(() => {
    if (open) void load(true)
  }, [open, load])

  async function copyLink() {
    if (!info?.linkUrl) return
    try {
      await navigator.clipboard.writeText(info.linkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Payment status"
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition hover:opacity-85 ${style.className} ${
          compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"
        }`}
      >
        <CreditCard className={compact ? "size-3" : "size-3.5"} aria-hidden />
        {style.label}
        {current === "PAID" || current === "PENDING"
          ? ` · ${rupees(shownAmount)}`
          : ""}
      </button>

      <PopupModal
        open={open}
        handler={() => setOpen(false)}
        title="Payment status"
        direction="center"
        className="w-full max-w-md !h-auto"
        secondaryBtn={
          <button
            type="button"
            className="dashboard-btn-secondary"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        }
        primaryBtn={
          <button
            type="button"
            className="dashboard-btn-primary inline-flex items-center gap-1.5"
            onClick={() => void load(true)}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </button>
        }
      >
        <div className="space-y-3 px-4 pb-2 text-sm">
          {error ? (
            <p className="text-red-700 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <dl className="space-y-2">
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">Status</dt>
              <dd>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.className}`}
                >
                  {style.label}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">Amount</dt>
              <dd className="font-semibold tabular-nums">
                {rupees(shownAmount ?? info?.clinicFee ?? null)}
              </dd>
            </div>
            {info?.paidAt ? (
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Paid on</dt>
                <dd className="font-semibold">
                  {formatPracticeDateTime(info.paidAt)}
                </dd>
              </div>
            ) : null}
            {info?.paymentId ? (
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Razorpay payment ID</dt>
                <dd className="font-mono text-xs">{info.paymentId}</dd>
              </div>
            ) : null}
          </dl>

          {info?.linkUrl ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2.5 dark:border-neutral-700">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {info.linkUrl}
              </span>
              <button
                type="button"
                className="text-xs font-bold text-[var(--theme-primary)] hover:underline"
                onClick={() => void copyLink()}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={info.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--theme-primary)] hover:underline"
              >
                Open <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          ) : null}

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {current === "PAID"
              ? "Paid online via Razorpay before the visit."
              : current === "PENDING"
                ? "Payment link sent on WhatsApp — waiting for the patient to pay. Refresh checks Razorpay."
                : current === "DECLINED"
                  ? "Patient chose to pay at the clinic when asked on WhatsApp."
                  : current === "EXPIRED" || current === "CANCELLED"
                    ? "The link was not paid in time — collect the fee at the clinic."
                    : info && info.clinicFee == null
                      ? "No consultation fee is set for this clinic, so WhatsApp doesn't offer online payment."
                      : "Online payment wasn't requested for this visit (booked outside WhatsApp or before the option existed)."}
          </p>
        </div>
      </PopupModal>
    </>
  )
}
