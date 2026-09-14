import type { ReactNode } from "react"

/** Row below the page header for search, filters, and actions. */
export default function AdminToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {children}
    </div>
  )
}
