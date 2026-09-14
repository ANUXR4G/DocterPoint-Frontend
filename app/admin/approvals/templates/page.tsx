"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { adminService, type AdminTemplate } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminTemplatesPage() {
  const [rows, setRows] = useState<AdminTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.pendingTemplates()
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

  async function approve(id: string) {
    const res = await adminService.approveTemplate(id)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage("Template approved.")
      await load()
    } else {
      setMessageTone("error")
      setMessage(res.message || "Approval failed.")
    }
  }

  async function reject(id: string) {
    const res = await adminService.rejectTemplate(id)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage("Template rejected.")
      await load()
    } else {
      setMessageTone("error")
      setMessage(res.message || "Rejection failed.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Message templates"
        subtitle="Review WhatsApp UTILITY templates before they go live on clinic lines."
        backHref="/admin/approvals"
      />

      <AdminToolbar>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Pending DRAFT and PENDING templates awaiting admin approval.
        </p>
        <p className="text-sm font-medium text-slate-500">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          pending
        </p>
      </AdminToolbar>

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No pending templates"
        emptyDescription="All templates are approved or none have been submitted."
        columns={[
          {
            key: "name",
            header: "Template",
            cell: (t) => (
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {t.name}
                </p>
                <p className="text-xs text-slate-500">{t.language}</p>
              </div>
            ),
          },
          {
            key: "clinic",
            header: "Scope",
            cell: (t) => t.practice?.name || "Platform-wide",
          },
          {
            key: "category",
            header: "Category",
            cell: (t) => <AdminBadge tone="blue">{t.category}</AdminBadge>,
          },
          {
            key: "body",
            header: "Body preview",
            cell: (t) => (
              <p className="max-w-md truncate text-slate-600 dark:text-slate-400">
                {t.body}
              </p>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (t) => (
              <AdminBadge tone={statusTone(t.status)}>{t.status}</AdminBadge>
            ),
          },
          {
            key: "updated",
            header: "Updated",
            cell: (t) =>
              new Date(t.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (t) => (
              <div className="flex flex-wrap gap-2">
                <AdminButton size="sm" onClick={() => void approve(t.id)}>
                  Approve
                </AdminButton>
                <AdminButton
                  variant="danger"
                  size="sm"
                  onClick={() => void reject(t.id)}
                >
                  Reject
                </AdminButton>
              </div>
            ),
          },
        ]}
      />
    </AdminShell>
  )
}
