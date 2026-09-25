"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import {
  nextWaNumberStatus,
  waStatusLabel,
} from "@/components/admin/AdminViewAllLink"
import { adminService, type AdminPendingNumber } from "@/lib/services/admin"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminPendingNumbersPage() {
  const [rows, setRows] = useState<AdminPendingNumber[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.pendingNumbers()
    if (res.status === "successful" && res.data) {
      setRows(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  async function advance(id: string, currentStatus: string) {
    const next = nextWaNumberStatus(currentStatus)
    if (!next) return
    const res = await adminService.advanceNumberStatus(id, next)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage(`Advanced to ${waStatusLabel(next)}.`)
      await load()
    } else {
      setMessageTone("error")
      setMessage(res.message || "Status update failed.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Numbers awaiting go-live"
        subtitle="WhatsApp lines in verification — advance through the provisioning pipeline."
        backHref="/admin/approvals"
        actions={
          <Link
            href="/admin/whatsapp"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          >
            WhatsApp ops →
          </Link>
        }
      />

      <AdminToolbar>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ASSIGNED → VERIFYING → DISPLAY NAME → TEMPLATES → LIVE
        </p>
        <p className="text-sm font-medium text-slate-500">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          in pipeline
        </p>
      </AdminToolbar>

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No numbers in verification"
        emptyDescription="Numbers awaiting Meta verification will appear here."
        columns={[
          {
            key: "phone",
            header: "Number",
            cell: (n) => (
              <div>
                <p className="font-semibold tabular-nums text-slate-900 dark:text-white">
                  {formatPhoneDisplay(n.phoneNumber)}
                </p>
                {n.displayName ? (
                  <p className="text-xs text-slate-500">{n.displayName}</p>
                ) : null}
              </div>
            ),
          },
          {
            key: "practice",
            header: "Practice",
            cell: (n) => n.practice?.name || "Unassigned",
          },
          {
            key: "status",
            header: "Stage",
            cell: (n) => (
              <AdminBadge tone={statusTone(n.status)}>
                {waStatusLabel(n.status)}
              </AdminBadge>
            ),
          },
          {
            key: "updated",
            header: "Updated",
            cell: (n) =>
              new Date(n.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (n) => {
              const next = nextWaNumberStatus(n.status)
              return next ? (
                <AdminButton size="sm" onClick={() => void advance(n.id, n.status)}>
                  Advance → {waStatusLabel(next)}
                </AdminButton>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )
            },
          },
        ]}
      />
    </AdminShell>
  )
}
