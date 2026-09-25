"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminSearchBar from "@/components/admin/AdminSearchBar"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { adminService, type AdminBooking } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"
import { formatPracticeDateTime, formatPracticeDate } from "@/lib/practiceTime"

const STATUS_FILTERS = [
  "",
  "SCHEDULED",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
] as const

export default function AdminBookingsPage() {
  const [rows, setRows] = useState<AdminBooking[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (query?: string, statusFilter?: string) => {
    setLoading(true)
    const res = await adminService.bookings(
      query,
      statusFilter || undefined,
    )
    if (res.status === "successful" && res.data) {
      setRows(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load(q.trim() || undefined, status))

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Bookings"
        subtitle="Cross-clinic booking activity (read-only). Status changes stay in clinic portals."
      />

      <AdminToolbar>
        <AdminSearchBar
          value={q}
          onChange={setQ}
          onSubmit={() => void load(q.trim() || undefined, status)}
          placeholder="Search patient, phone, or clinic…"
        />
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value
            setStatus(next)
            void load(q.trim() || undefined, next)
          }}
          className="form-input min-h-11 rounded-xl border-slate-200 bg-white px-3 text-sm shadow-sm dark:border-white/15 dark:bg-white/5"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          bookings
        </p>
      </AdminToolbar>

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No bookings found"
        emptyDescription="Try another search or status filter."
        columns={[
          {
            key: "practice",
            header: "Clinic",
            cell: (b) => (
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {b.practice.name}
                </p>
                <p className="text-xs text-slate-500">
                  {b.location.name}
                  {b.location.city ? `, ${b.location.city}` : ""}
                </p>
              </div>
            ),
          },
          {
            key: "patient",
            header: "Patient",
            cell: (b) => (
              <div>
                <p className="font-medium">{b.patientName || "—"}</p>
                <p className="text-xs tabular-nums text-slate-500">
                  {b.patientPhone}
                </p>
              </div>
            ),
          },
          {
            key: "when",
            header: "When",
            cell: (b) => {
              if (b.slotStart) return formatPracticeDateTime(b.slotStart)
              if (b.sessionDate) return formatPracticeDate(b.sessionDate)
              return "—"
            },
          },
          {
            key: "mode",
            header: "Mode",
            cell: (b) => (
              <span className="text-xs">
                {b.mode.replace(/_/g, " ")}
                {b.tokenNumber != null ? ` · #${b.tokenNumber}` : ""}
              </span>
            ),
          },
          {
            key: "channel",
            header: "Channel",
            cell: (b) => b.channel.replace(/_/g, " "),
          },
          {
            key: "status",
            header: "Status",
            cell: (b) => (
              <AdminBadge tone={statusTone(b.status)}>{b.status}</AdminBadge>
            ),
          },
        ]}
      />
    </AdminShell>
  )
}
