import type { ReactNode } from "react"
import AdminEmptyState from "@/components/admin/AdminEmptyState"

type Column<T> = {
  key: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  emptyMessage?: string
  emptyDescription?: string
  loading?: boolean
}

export default function AdminTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "No records found.",
  emptyDescription,
  loading = false,
}: Props<T>) {
  if (loading) {
    return (
      <div className="dashboard-panel !min-h-0 overflow-hidden !p-0">
        <div className="animate-pulse space-y-0 divide-y divide-slate-100 dark:divide-white/5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4 px-5 py-4">
              <div className="h-10 flex-1 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="hidden h-10 w-32 rounded-xl bg-slate-100 sm:block dark:bg-slate-800" />
              <div className="hidden h-10 w-24 rounded-xl bg-slate-100 md:block dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <AdminEmptyState title={emptyMessage} description={emptyDescription} />
    )
  }

  return (
    <div className="dashboard-panel overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50/90 dark:bg-white/[0.03]">
            <tr className="border-b border-slate-100 dark:border-white/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-white/5">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="transition-colors hover:bg-sky-50/60 dark:hover:bg-blue-500/[0.06]"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-5 py-4 align-middle text-slate-700 dark:text-slate-300 ${col.className ?? ""}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        {rows.length} record{rows.length === 1 ? "" : "s"}
      </div>
    </div>
  )
}
