"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminTable from "@/components/admin/AdminTable"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminToolbar from "@/components/admin/AdminToolbar"
import { AdminBadge } from "@/components/admin/AdminBadge"
import { adminService, type AdminReview } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<AdminReview[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")
  const [filter, setFilter] = useState<"pending" | "published" | "all">("pending")

  const load = useCallback(async () => {
    setLoading(true)
    const published =
      filter === "pending" ? false : filter === "published" ? true : undefined
    const res = await adminService.reviews(published)
    if (res.status === "successful" && res.data) {
      setRows(res.data.items)
      setTotal(res.data.total)
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  async function updateReview(id: string, publish: boolean) {
    const res = publish
      ? await adminService.approveReview(id)
      : await adminService.rejectReview(id)
    if (res.status === "successful") {
      setMessageTone("success")
      setMessage(publish ? "Review published." : "Review rejected.")
      await load()
    } else {
      setMessageTone("error")
      setMessage(res.message || "Update failed.")
    }
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Pending reviews"
        subtitle="Approve or reject patient reviews before they appear on clinic profiles."
        backHref="/admin/approvals"
      />

      <AdminToolbar>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "pending", label: "Pending" },
              { id: "published", label: "Published" },
              { id: "all", label: "All" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === tab.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-600 hover:bg-sky-50 dark:text-slate-300 dark:hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium text-slate-500">
          <span className="font-bold tabular-nums text-slate-800 dark:text-white">
            {total}
          </span>{" "}
          reviews
        </p>
      </AdminToolbar>

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      <AdminTable
        loading={loading}
        rows={rows}
        emptyMessage="No reviews in this queue"
        emptyDescription="New patient reviews will appear here for approval."
        columns={[
          {
            key: "author",
            header: "Author",
            cell: (r) => (
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {r.authorName}
                </p>
                {r.authorPhone ? (
                  <p className="text-xs tabular-nums text-slate-500">
                    {r.authorPhone}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            key: "clinic",
            header: "Clinic",
            cell: (r) => (
              <div>
                <p className="font-medium">{r.practice.name}</p>
                <p className="text-xs text-slate-500">/{r.practice.slug}</p>
              </div>
            ),
          },
          {
            key: "rating",
            header: "Rating",
            cell: (r) => (
              <span className="font-semibold tabular-nums">{r.rating}★</span>
            ),
          },
          {
            key: "body",
            header: "Review",
            cell: (r) => (
              <p className="max-w-xs truncate text-slate-600 dark:text-slate-400">
                {r.body || "—"}
              </p>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (r) => (
              <AdminBadge tone={r.isPublished ? "green" : "amber"}>
                {r.isPublished ? "Published" : "Pending"}
              </AdminBadge>
            ),
          },
          {
            key: "date",
            header: "Submitted",
            cell: (r) =>
              new Date(r.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
          },
          {
            key: "actions",
            header: "Actions",
            cell: (r) =>
              r.isPublished ? (
                <AdminButton
                  variant="secondary"
                  size="sm"
                  onClick={() => void updateReview(r.id, false)}
                >
                  Unpublish
                </AdminButton>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AdminButton size="sm" onClick={() => void updateReview(r.id, true)}>
                    Publish
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onClick={() => void updateReview(r.id, false)}
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
