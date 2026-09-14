"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminSearchBar from "@/components/admin/AdminSearchBar"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { adminService, type AdminPatient } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

function genderLabel(gender?: string | null) {
  const g = (gender || "").toLowerCase()
  if (g === "male") return "Male"
  if (g === "female") return "Female"
  if (g === "others" || g === "other") return "Others"
  return "Not set"
}

export default function AdminPatientsPage() {
  const [rows, setRows] = useState<AdminPatient[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (query?: string) => {
    setLoading(true)
    const res = await adminService.patients(query)
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

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Patients"
        subtitle="Platform-wide patient directory (read-only). Clinics own clinical edits."
      />

      <AdminToolbar>
        <AdminSearchBar
          value={q}
          onChange={setQ}
          onSubmit={() => void load(q.trim() || undefined)}
          placeholder="Search name, email, or phone…"
        />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          patients
        </p>
      </AdminToolbar>

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No patients found"
        emptyDescription="Try a different name, email, or phone."
        columns={[
          {
            key: "name",
            header: "Patient",
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
            key: "phone",
            header: "Phone",
            cell: (r) => (
              <span className="tabular-nums">
                {r.contactNumber || r.phone || "—"}
              </span>
            ),
          },
          {
            key: "gender",
            header: "Gender",
            cell: (r) => (
              <AdminBadge tone={statusTone(r.gender || "UNKNOWN")}>
                {genderLabel(r.gender)}
              </AdminBadge>
            ),
          },
          {
            key: "dob",
            header: "DOB",
            cell: (r) => r.dateOfBirth || "—",
          },
          {
            key: "id",
            header: "ID on file",
            cell: (r) => (
              <AdminBadge tone={r.hasId ? "green" : "neutral"}>
                {r.hasId ? "Yes" : "No"}
              </AdminBadge>
            ),
          },
          {
            key: "joined",
            header: "Joined",
            cell: (r) =>
              new Date(r.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
          },
        ]}
      />
    </AdminShell>
  )
}
