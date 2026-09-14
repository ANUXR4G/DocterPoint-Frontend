import type { ReactNode } from "react"

export default function AdminEmptyState({
  title = "Nothing here yet",
  description,
}: {
  title?: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600/10 text-2xl">
        📋
      </div>
      <p className="mt-4 text-base font-semibold text-slate-800 dark:text-white">
        {title}
      </p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}
    </div>
  )
}
