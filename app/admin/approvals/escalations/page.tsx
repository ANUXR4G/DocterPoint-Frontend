"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge } from "@/components/admin/AdminBadge"
import { adminService, type AdminEscalation } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminEscalationsPage() {
  const [rows, setRows] = useState<AdminEscalation[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.escalations()
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

  async function resolve(id: string, status: "bot_active" | "closed") {
    const res = await adminService.resolveEscalation(id, status)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage(
        status === "bot_active"
          ? "Returned to bot — patient can continue with Mira."
          : "Conversation closed.",
      )
      await load()
    } else {
      setMessageTone("error")
      setMessage(res.message || "Update failed.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="WhatsApp escalations"
        subtitle="Conversations handed off from the bot — resolve or return to automated flow."
        backHref="/admin/approvals"
      />

      <AdminToolbar>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Patients waiting for human follow-up on WhatsApp.
        </p>
        <p className="text-sm font-medium text-slate-500">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          open
        </p>
      </AdminToolbar>

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="Queue is clear"
        emptyDescription="No conversations are currently handed off."
        columns={[
          {
            key: "phone",
            header: "Patient",
            cell: (e) => (
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                {e.patientPhone}
              </span>
            ),
          },
          {
            key: "clinic",
            header: "Clinic",
            cell: (e) => (
              <div>
                <p className="font-medium">{e.practice.name}</p>
                <p className="text-xs text-slate-500">/{e.practice.slug}</p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (e) => <AdminBadge tone="amber">{e.status}</AdminBadge>,
          },
          {
            key: "updated",
            header: "Last activity",
            cell: (e) =>
              new Date(e.updatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (e) => (
              <div className="flex flex-wrap gap-2">
                <AdminButton
                  size="sm"
                  onClick={() => void resolve(e.id, "bot_active")}
                >
                  Return to bot
                </AdminButton>
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => void resolve(e.id, "closed")}
                >
                  Close
                </AdminButton>
              </div>
            ),
          },
        ]}
      />
    </AdminShell>
  )
}
