"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import {
  adminService,
  type AdminNotificationEvent,
} from "@/lib/services/admin"
import { AdminBadge } from "@/components/admin/AdminBadge"
import { useAdminOpsSocket } from "@/hooks/useProctoSocket"

const STATUS_FILTERS = ["ALL", "PENDING", "SENT", "FAILED"] as const

export default function AdminSupportNotifications() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL")
  const [items, setItems] = useState<AdminNotificationEvent[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.supportNotifications(
      status === "ALL" ? undefined : status,
    )
    if (res.status === "successful" && res.data) {
      setItems(res.data.items ?? [])
      setPendingCount(res.data.pendingCount ?? 0)
      setFailedCount(res.data.failedCount ?? 0)
    }
    setLoading(false)
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsSocket(
    true,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        event.event === "ops_invalidate"
      ) {
        void load()
      }
    },
    () => void load(),
  )

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
              {s === "ALL" ? "All" : s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {pendingCount} pending
          </span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-900 dark:bg-rose-950/50 dark:text-rose-100">
            {failedCount} failed
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No notification events for this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {n.type.replace(/_/g, " ")}
                    <span className="ml-2 text-xs font-semibold text-neutral-500">
                      via {n.channel}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {n.practice?.name ?? "Practice"} ·{" "}
                    {n.booking?.patientPhone ?? "—"}
                  </p>
                </div>
                <AdminBadge
                  tone={
                    n.status === "SENT"
                      ? "green"
                      : n.status === "FAILED"
                        ? "red"
                        : "amber"
                  }
                >
                  {n.status}
                </AdminBadge>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
                <span>
                  Created {format(new Date(n.createdAt), "dd MMM yyyy · HH:mm")}
                </span>
                {n.sentAt ? (
                  <span>
                    Sent {format(new Date(n.sentAt), "dd MMM yyyy · HH:mm")}
                  </span>
                ) : null}
                {n.booking?.status ? (
                  <span>Booking {n.booking.status}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
