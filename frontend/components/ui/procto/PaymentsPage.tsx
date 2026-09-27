"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Ban,
  Copy,
  ExternalLink,
  IndianRupee,
  RefreshCw,
  Send,
} from "lucide-react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import PaymentRequestModal from "@/components/ui/procto/PaymentRequestModal"
import {
  proctoService,
  type PaymentRequestRow,
  type PaymentsListResponse,
} from "@/lib/services/procto"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { formatPracticeDateTime } from "@/lib/practiceTime"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import {
  formatRupees,
  paymentStatusStyle,
  PAYMENT_KIND_LABEL,
} from "@/lib/paymentDisplay"

const STATUS_TABS = [
  { id: "", label: "All" },
  { id: "PENDING", label: "Pending" },
  { id: "PAID", label: "Paid" },
  { id: "EXPIRED", label: "Expired" },
  { id: "CANCELLED", label: "Cancelled" },
] as const

const RANGES = [
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 3 months", days: 90 },
  { id: "365d", label: "Last 12 months", days: 365 },
  { id: "all", label: "All time", days: 0 },
] as const

type RangeId = (typeof RANGES)[number]["id"]

function channelLabel(r: PaymentRequestRow): string {
  if (r.channel === "WHATSAPP_BOT") return "WhatsApp bot"
  if (r.channel === "PROVIDER_APP") return "Doctor app"
  return "Portal"
}

function deliveryLabel(r: PaymentRequestRow): string | null {
  if (r.channel === "WHATSAPP_BOT") return "Shared in chat"
  if (r.waDelivery === "SENT") return "Sent on WhatsApp"
  if (r.waDelivery === "SIMULATED") return "WhatsApp (test mode)"
  if (r.waDelivery === "FAILED") return "WhatsApp failed"
  return null
}

export default function PaymentsPage({
  portal = "doctor",
}: {
  portal?: "doctor" | "clinic"
}) {
  const { practiceId, practiceName, isClinicAdmin, lastPaymentEvent } =
    usePracticeDashboard()
  const [status, setStatus] = useState("")
  const [range, setRange] = useState<RangeId>("30d")
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [data, setData] = useState<PaymentsListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const from = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? 0
    if (!days) return undefined
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }, [range])

  const load = useCallback(async () => {
    if (!practiceId) return
    const id = ++reqId.current
    setLoading(true)
    setError("")
    const res = await proctoService.listPayments(practiceId, {
      status: status || undefined,
      from,
      q: debounced || undefined,
    })
    if (id !== reqId.current) return
    setLoading(false)
    if (res?.status !== "successful" || !res.data) {
      setError(res?.message || "Could not load payments.")
      return
    }
    setData(res.data as PaymentsListResponse)
  }, [practiceId, status, from, debounced])

  useEffect(() => {
    void load()
  }, [load])

  // Live: upsert rows pushed over the practice socket; totals refresh in the background.
  useEffect(() => {
    if (!lastPaymentEvent) return
    setData((prev) => {
      if (!prev) return prev
      const idx = prev.items.findIndex((r) => r.id === lastPaymentEvent.id)
      if (idx < 0) return prev
      const items = [...prev.items]
      items[idx] = lastPaymentEvent
      return { ...prev, items }
    })
    const t = setTimeout(() => void load(), 600)
    return () => clearTimeout(t)
  }, [lastPaymentEvent, load])

  function upsert(row: PaymentRequestRow) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((r) => (r.id === row.id ? row : r)),
          }
        : prev,
    )
  }

  async function act(
    row: PaymentRequestRow,
    action: "refresh" | "resend" | "cancel",
  ) {
    if (action === "cancel" && !window.confirm("Cancel this payment link? The patient won't be able to pay with it.")) {
      return
    }
    setBusyId(row.id)
    setError("")
    setNotice("")
    const res =
      action === "refresh"
        ? await proctoService.getPaymentRequest(row.id, true)
        : action === "resend"
          ? await proctoService.resendPaymentRequest(row.id)
          : await proctoService.cancelPaymentRequest(row.id)
    setBusyId(null)
    if (res?.status !== "successful" || !res.data) {
      setError(res?.message || "Something went wrong.")
      void load()
      return
    }
    const next = res.data as PaymentRequestRow
    upsert(next)
    if (action === "resend") {
      setNotice(
        next.waDelivery === "FAILED"
          ? `WhatsApp didn't deliver: ${next.waError || "unknown error"}. Copy the link and share it.`
          : `Re-sent to ${next.patientName || "the patient"} on WhatsApp.`,
      )
    }
    if (action !== "refresh") void load()
  }

  async function copy(row: PaymentRequestRow) {
    if (!row.linkUrl) return
    try {
      await navigator.clipboard.writeText(row.linkUrl)
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  const summary = data?.summary
  const items = data?.items ?? []
  const showDoctor = isClinicAdmin && portal === "clinic"

  return (
    <>
      <DashboardPageHeader
        compact
        eyebrow={portal === "clinic" ? "Clinic" : "Doctor"}
        title="Payments"
        subtitle={
          practiceName
            ? `Razorpay payments for ${practiceName} — WhatsApp advance / fee and custom requests.`
            : "Razorpay payments — WhatsApp advance / fee and custom requests."
        }
        action={
          <button
            type="button"
            className="dashboard-btn-primary inline-flex items-center gap-1.5"
            onClick={() => setRequestOpen(true)}
            disabled={data?.paymentsEnabled === false}
            title={
              data?.paymentsEnabled === false
                ? "Online payments are not set up yet"
                : undefined
            }
          >
            <IndianRupee className="size-4" aria-hidden />
            Request payment
          </button>
        }
      />

      <PaymentRequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onSent={(row) => {
          setNotice(
            row.waDelivery === "FAILED"
              ? `Link created for ${formatRupees(row.amount)}, but WhatsApp didn't deliver it (${row.waError || "unknown error"}). Copy the link below and share it.`
              : `Payment request for ${formatRupees(row.amount)} sent to ${row.patientName || "the patient"} on WhatsApp.`,
          )
          setStatus("")
          void load()
        }}
      />

      {data?.paymentsEnabled === false ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Online payments are not set up on this server yet (Razorpay keys
          missing). Existing records are shown below.
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Collected
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatRupees(summary?.collected ?? 0)}
          </p>
          <p className="text-xs opacity-70">{summary?.paidCount ?? 0} paid</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Pending
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {formatRupees(summary?.pending ?? 0)}
          </p>
          <p className="text-xs opacity-70">
            {summary?.pendingCount ?? 0} awaiting payment
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-700">
          <p className="text-xs font-bold uppercase tracking-wide opacity-60">
            Requests
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {summary?.total ?? 0}
          </p>
          <p className="text-xs opacity-70">
            {summary?.closedCount ?? 0} expired / cancelled
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id || "all"}
              type="button"
              role="tab"
              aria-selected={status === t.id}
              onClick={() => setStatus(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                status === t.id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeId)}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          placeholder="Search patient, mobile, purpose or payment ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="dashboard-btn-secondary inline-flex items-center gap-1.5"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw
            className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </button>
      </div>

      {notice ? (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!data && loading ? (
        <p className="text-sm opacity-70">Loading…</p>
      ) : items.length === 0 ? (
        <p className="gg-faint rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm font-semibold dark:border-neutral-700">
          No payments here yet. WhatsApp bookings offer an advance / fee
          payment, or use <strong>Request payment</strong> to send any amount.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 md:block dark:border-neutral-800">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900/60">
                <tr>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">For</th>
                  {showDoctor ? <th className="px-4 py-3">Doctor</th> : null}
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid / payment ID</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {items.map((r) => {
                  const s = paymentStatusStyle(r.status)
                  const delivery = deliveryLabel(r)
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatPracticeDateTime(r.createdAt)}
                        <div className="text-xs opacity-60">
                          {channelLabel(r)}
                          {r.requestedByName ? ` · ${r.requestedByName}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">
                          {r.patientName || "Patient"}
                        </div>
                        <div className="text-xs opacity-60">
                          {formatPhoneDisplay(r.patientPhone)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{r.label}</div>
                        <div className="text-xs opacity-60">
                          {PAYMENT_KIND_LABEL[r.kind] ?? r.kind}
                          {r.bookingId ? (
                            <>
                              {" · "}
                              <Link
                                href={`/doctor/queue/${r.bookingId}`}
                                className="font-semibold text-[var(--theme-primary)] hover:underline"
                              >
                                Visit
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                      {showDoctor ? (
                        <td className="px-4 py-3">{r.providerName || "—"}</td>
                      ) : null}
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatRupees(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.className}`}
                        >
                          {s.label}
                        </span>
                        {delivery ? (
                          <div
                            className={`mt-1 text-xs ${
                              r.waDelivery === "FAILED"
                                ? "text-red-600 dark:text-red-400"
                                : "opacity-60"
                            }`}
                            title={r.waError || undefined}
                          >
                            {delivery}
                          </div>
                        ) : null}
                        {r.status === "PENDING" && r.expiresAt ? (
                          <div className="text-xs opacity-60">
                            Valid till {formatPracticeDateTime(r.expiresAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {r.paidAt ? (
                          <>
                            <div>{formatPracticeDateTime(r.paidAt)}</div>
                            <div className="font-mono text-xs opacity-70">
                              {r.paymentId || "—"}
                            </div>
                          </>
                        ) : (
                          <span className="opacity-50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          row={r}
                          busy={busyId === r.id}
                          copied={copiedId === r.id}
                          onCopy={() => void copy(r)}
                          onAct={(a) => void act(r, a)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {items.map((r) => {
              const s = paymentStatusStyle(r.status)
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.patientName || "Patient"}</p>
                      <p className="text-xs opacity-60">
                        {formatPhoneDisplay(r.patientPhone)}
                      </p>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      {formatRupees(r.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm">{r.label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 font-semibold ${s.className}`}
                    >
                      {s.label}
                    </span>
                    <span className="opacity-60">
                      {formatPracticeDateTime(r.paidAt || r.createdAt)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <RowActions
                      row={r}
                      busy={busyId === r.id}
                      copied={copiedId === r.id}
                      onCopy={() => void copy(r)}
                      onAct={(a) => void act(r, a)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

function RowActions({
  row,
  busy,
  copied,
  onCopy,
  onAct,
}: {
  row: PaymentRequestRow
  busy: boolean
  copied: boolean
  onCopy: () => void
  onAct: (a: "refresh" | "resend" | "cancel") => void
}) {
  const btn =
    "inline-flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  const pending = row.status === "PENDING"
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={btn}
        title="Check status with Razorpay"
        aria-label="Refresh status"
        disabled={busy || !pending}
        onClick={() => onAct("refresh")}
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
      </button>
      {pending && row.linkUrl ? (
        <>
          <button
            type="button"
            className={btn}
            title={copied ? "Copied" : "Copy payment link"}
            aria-label="Copy payment link"
            onClick={onCopy}
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
          <a
            className={btn}
            href={row.linkUrl}
            target="_blank"
            rel="noreferrer"
            title="Open payment page"
            aria-label="Open payment page"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <button
            type="button"
            className={btn}
            title="Send again on WhatsApp"
            aria-label="Resend on WhatsApp"
            disabled={busy}
            onClick={() => onAct("resend")}
          >
            <Send className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className={`${btn} hover:!bg-red-50 hover:!text-red-700 dark:hover:!bg-red-500/15`}
            title="Cancel link"
            aria-label="Cancel link"
            disabled={busy}
            onClick={() => onAct("cancel")}
          >
            <Ban className="size-3.5" aria-hidden />
          </button>
        </>
      ) : null}
      {copied ? (
        <span className="text-xs font-semibold text-emerald-600">Copied</span>
      ) : null}
    </div>
  )
}
