"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  proctoService,
  type PracticeNotification,
} from "@/lib/services/procto"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { emitPracticeNotificationsChanged } from "@/hooks/usePracticeOpenNotifications"

const STATUS_FILTERS = ["ALL", "SENT", "PENDING", "FAILED", "SKIPPED"] as const

/** Soft labels for send status — avoid alarming "Failed" in the clinic inbox. */
function statusLabel(status: string) {
  switch ((status || "").toUpperCase()) {
    case "ALL":
      return "All"
    case "SENT":
      return "Sent"
    case "PENDING":
      return "Pending"
    case "FAILED":
      return "Exited"
    case "SKIPPED":
      return "Inbox only"
    default:
      return status ? status.charAt(0) + status.slice(1).toLowerCase() : status
  }
}

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

/**
 * HTTP list + shared practice dashboard WS (no second socket).
 * Silent refresh only — never flips the full-page loading flag.
 */
export default function PracticeNotificationsPanel() {
  const dash = usePracticeDashboard()
  const [fallback, setFallback] = useState<{
    id: string
    name: string | null
  } | null>(null)
  const [resolvingPractice, setResolvingPractice] = useState(
    () => !dash.practiceId,
  )
  const [noPractice, setNoPractice] = useState(false)

  const practiceId = dash.practiceId ?? fallback?.id ?? null
  const practiceName = dash.practiceName ?? fallback?.name ?? null
  const liveConnected = dash.liveConnected

  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL")
  const [items, setItems] = useState<PracticeNotification[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [dismissingId, setDismissingId] = useState<string | null>(null)

  const statusRef = useRef(status)
  statusRef.current = status
  const practiceIdRef = useRef(practiceId)
  practiceIdRef.current = practiceId
  const hasItemsRef = useRef(false)
  hasItemsRef.current = items.length > 0
  const requestGen = useRef(0)

  useEffect(() => {
    if (dash.practiceId) {
      setFallback(null)
      setNoPractice(false)
      setResolvingPractice(false)
      return
    }
    let cancelled = false
    setResolvingPractice(true)
    const safety = setTimeout(() => {
      if (cancelled) return
      setResolvingPractice(false)
      if (!practiceIdRef.current) {
        setNoPractice(true)
        setError((e) => e || "Could not resolve practice (timed out).")
      }
    }, 14_000)
    void (async () => {
      try {
        const mine = await proctoService.getMyPractices()
        if (cancelled) return
        clearTimeout(safety)
        setResolvingPractice(false)
        if (
          mine.status === "successful" &&
          Array.isArray(mine.data) &&
          mine.data[0]
        ) {
          const row = mine.data[0] as {
            practiceId?: string
            practice?: { id?: string; name?: string | null } | null
            id?: string
          }
          const id = proctoService.resolvePracticeId(row)
          if (id) {
            setFallback({ id, name: row.practice?.name ?? null })
            setNoPractice(false)
            return
          }
        }
        setFallback(null)
        setNoPractice(true)
      } catch {
        if (cancelled) return
        clearTimeout(safety)
        setResolvingPractice(false)
        setFallback(null)
        setNoPractice(true)
        setError("Could not resolve practice.")
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(safety)
    }
  }, [dash.practiceId])

  const fetchList = useCallback(async (opts?: { silent?: boolean }) => {
    const id = practiceIdRef.current
    if (!id) return
    const gen = ++requestGen.current
    const silent = Boolean(opts?.silent) || hasItemsRef.current
    if (silent) setRefreshing(true)
    else {
      setLoading(true)
      setError("")
    }
    try {
      const res = await proctoService.listPracticeNotifications(id, {
        status: statusRef.current === "ALL" ? undefined : statusRef.current,
        take: 80,
      })
      if (gen !== requestGen.current) return
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
        setError("")
      } else if (!silent) {
        setError(res.message || "Could not load notifications.")
        setItems([])
      } else {
        setError(res.message || "Could not refresh notifications.")
      }
    } catch {
      if (gen !== requestGen.current) return
      if (!silent) {
        setError("Could not load notifications.")
        setItems([])
      } else {
        setError("Could not refresh notifications.")
      }
    } finally {
      if (gen === requestGen.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!practiceId) {
      setLoading(false)
      return
    }
    // Avoid empty-state flash before the first paint of a fetch.
    if (!hasItemsRef.current) setLoading(true)
    void fetchList()
  }, [practiceId, status, fetchList])

  useEffect(() => {
    if (!practiceId) return
    if (dash.bookingTick === 0 && dash.conversationTick === 0) return
    void fetchList({ silent: true })
  }, [practiceId, dash.bookingTick, dash.conversationTick, fetchList])

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
    emitPracticeNotificationsChanged()
  }

  if (!practiceId) {
    if (resolvingPractice) {
      return (
        <p className="text-sm text-neutral-500">Loading notifications…</p>
      )
    }
    return (
      <div className="space-y-3">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        ) : null}
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {noPractice
            ? "Join or create a practice to see notifications."
            : "Could not load practice."}
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              proctoService.invalidateMyPracticesCache()
              setNoPractice(false)
              setError("")
              setResolvingPractice(true)
              void (async () => {
                try {
                  const mine = await proctoService.getMyPractices()
                  setResolvingPractice(false)
                  if (
                    mine.status === "successful" &&
                    Array.isArray(mine.data) &&
                    mine.data[0]
                  ) {
                    const row = mine.data[0] as {
                      practiceId?: string
                      practice?: { id?: string; name?: string | null } | null
                      id?: string
                    }
                    const id = proctoService.resolvePracticeId(row)
                    if (id) {
                      setFallback({
                        id,
                        name: row.practice?.name ?? null,
                      })
                      setNoPractice(false)
                      return
                    }
                  }
                  setNoPractice(true)
                } catch {
                  setResolvingPractice(false)
                  setNoPractice(true)
                  setError("Could not resolve practice.")
                }
              })()
            }}
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200"
          >
            Retry
          </button>
        </div>
      </div>
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
              {statusLabel(s)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
          <span
            className={`rounded-full px-2.5 py-1 ${
              liveConnected
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
            }`}
            title={
              liveConnected
                ? "Live updates connected"
                : "Connecting live updates…"
            }
          >
            {liveConnected ? "Live" : "Connecting…"}
          </span>
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
            {failedCount} exited
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => void fetchList()}
            className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-sm text-neutral-500">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No open notifications. Booking, queue, document, and support alerts will appear here.
        </p>
      ) : (
        <ul
          className={`space-y-2 ${refreshing ? "opacity-70 transition-opacity" : "transition-opacity"}`}
        >
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
              className={`gg-card cursor-pointer p-4 transition hover:border-[var(--theme-primary)] ${
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
                      {statusLabel(n.status)}
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
                    {format(new Date(n.createdAt), "dd MMM yyyy · h:mm a")}
                  </p>
                  {n.sentAt ? (
                    <p className="mt-0.5 opacity-80">
                      Sent {format(new Date(n.sentAt), "h:mm a")}
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
