"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminSearchBar from "@/components/admin/AdminSearchBar"
import AdminToolbar from "@/components/admin/AdminToolbar"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import { AdminBadge } from "@/components/admin/AdminBadge"
import { adminService, type AdminDoctor } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminDoctorsPage() {
  const [rows, setRows] = useState<AdminDoctor[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  const load = useCallback(async (query?: string) => {
    setLoading(true)
    const res = await adminService.doctors(query)
    if (res.status === "successful" && res.data) {
      setRows(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load(q.trim() || undefined))

  async function toggleActive(row: AdminDoctor) {
    const res = await adminService.setMemberActive(row.id, !row.isActive)
    if (res.status === "successful") {
      setMessage(`${row.name || row.email} ${row.isActive ? "deactivated" : "activated"}.`)
      await load(q.trim() || undefined)
    } else {
      setMessage(res.message || "Update failed.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Doctors & staff"
        subtitle="Manage practice members across all clinics."
      />

      <AdminToolbar>
        <AdminSearchBar
          value={q}
          onChange={setQ}
          onSubmit={() => void load(q.trim() || undefined)}
          placeholder="Search doctor or clinic…"
        />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          members
        </p>
      </AdminToolbar>

      {message ? <AdminAlert tone="success">{message}</AdminAlert> : null}

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No doctors found"
        emptyDescription="Try searching by name, email, or clinic."
        columns={[
          {
            key: "name",
            header: "Provider",
            cell: (r) => (
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {r.name || "—"}
                </p>
                <p className="text-xs text-slate-500">{r.email}</p>
              </div>
            ),
          },
          {
            key: "practice",
            header: "Clinic",
            cell: (r) => (
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {r.practice.name}
                </p>
                <p className="text-xs text-slate-500">/{r.practice.slug}</p>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            cell: (r) => <AdminBadge tone="blue">{r.role}</AdminBadge>,
          },
          {
            key: "status",
            header: "Status",
            cell: (r) => (
              <AdminBadge tone={r.isActive ? "green" : "red"}>
                {r.isActive ? "Active" : "Inactive"}
              </AdminBadge>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (r) => (
              <AdminButton
                variant={r.isActive ? "danger" : "primary"}
                size="sm"
                onClick={() => void toggleActive(r)}
              >
                {r.isActive ? "Deactivate" : "Activate"}
              </AdminButton>
            ),
          },
        ]}
      />
    </AdminShell>
  )
}
