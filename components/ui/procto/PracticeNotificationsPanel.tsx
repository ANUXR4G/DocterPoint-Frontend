"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  proctoService,
  type PracticeNotification,
} from "@/lib/services/procto"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { useProctoSocket } from "@/hooks/useProctoSocket"

const STATUS_FILTERS = ["ALL", "SENT", "PENDING", "FAILED", "SKIPPED"] as const

function statusBadgeClass(status: string) {
  switch ((status || "").toUpperCase()) {
    case "SENT":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
    case "PENDING":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
    case "FAILED":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100"
    case "SKIPPED":
      return "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
    default:
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
  }
}

function roleBadgeClass(role: string) {
  return role === "clinic"
    ? "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100"
    : "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
}

export default function PracticeNotificationsPanel() {
  const { practiceId, practiceName, ready } = usePracticeDashboard()
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL")
  const [items, setItems] = useState<PracticeNotification[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!practiceId) return
    setLoading(true)
    setError("")
    const res = await proctoService.listPracticeNotifications(practiceId, {
      status: status === "ALL" ? undefined : status,
      take: 80,
    })
    if (res.status === "successful" && res.data) {
      const data = res.data as {
        total?: number
        pendingCount?: number
        failedCount?: number
        sentCount?: number
        items?: PracticeNotification[]
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(data.total ?? 0)
      setPendingCount(data.pendingCount ?? 0)
      setFailedCount(data.failedCount ?? 0)
      setSentCount(data.sentCount ?? 0)
    } else {
      setError(res.message || "Could not load notifications.")
      setItems([])
    }
    setLoading(false)
  }, [practiceId, status])

  useEffect(() => {
    if (ready && practiceId) void load()
  }, [ready, practiceId, load])

  useProctoSocket(
    practiceId,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        (event.event === "booking_created" ||
          event.event === "booking_updated")
      ) {
        void load()
      }
    },
    () => void load(),
  )

  async function dismiss(id: string) {
    if (!practiceId || dismissingId) return
    setDismissingId(id)
    const prev = items
    setItems((cur) => cur.filter((n) => n.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    const res = await proctoService.dismissPracticeNotification(
      practiceId,
      id,
    )
    setDismissingId(null)
    if (res.status !== "successful") {
      setItems(prev)
      setTotal(prev.length)
      setError(res.message || "Could not clear notification.")
      return
    }
    setError("")
  }

  if (!ready) {
    return (
      <p className="text-sm text-neutral-500">Loading practice…</p>
    )
  }

  if (!practiceId) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Join or create a practice to see notifications.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                status === s
                  ? "bg-[var(--theme-primary)] text-white"
                  : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
            {total} open
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
            {sentCount} sent
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {pendingCount} pending
          </span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100">
            {failedCount} failed
          </span>
        </div>
      </div>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Open alerts for{" "}
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
          {practiceName || "your practice"}
        </span>
        . Tap a row to clear it from the list.
      </p>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No open notifications. New booking alerts will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              role="button"
              tabIndex={0}
              aria-disabled={dismissingId === n.id}
              onClick={() => void dismiss(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  void dismiss(n.id)
                }
              }}
              className={`cursor-pointer rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-[var(--theme-primary)] hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/40 dark:hover:bg-neutral-900 ${
                dismissingId === n.id ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {n.title}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {n.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${statusBadgeClass(n.status)}`}
                    >
                      {n.status}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${roleBadgeClass(n.recipientRole)}`}
                    >
                      {n.recipientRole === "clinic" ? "Clinic" : "Patient"}
                    </span>
                    <span className="text-neutral-500">
                      via {n.channel}
                      {n.to ? ` · ${n.to}` : ""}
                    </span>
                    <span className="font-semibold text-neutral-400">
                      Tap to clear
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-neutral-500">
                  <p>
                    {format(new Date(n.createdAt), "dd MMM yyyy · HH:mm")}
                  </p>
                  {n.sentAt ? (
                    <p className="mt-0.5 opacity-80">
                      Sent {format(new Date(n.sentAt), "HH:mm")}
                    </p>
                  ) : null}
                  {n.booking?.id ? (
                    <Link
                      href={`/doctor/queue/${n.booking.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-block font-semibold text-[var(--theme-primary)] hover:underline"
                    >
                      Open visit →
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
