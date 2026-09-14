import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  description?: string
  count?: number
  action?: ReactNode
  children: ReactNode
  className?: string
  compact?: boolean
}

export default function AdminSection({
  title,
  description,
  count,
  action,
  children,
  className,
  compact = false,
}: Props) {
  return (
    <section
      className={cn(
        "dashboard-panel !min-h-0 space-y-4",
        compact ? "!p-4" : "!p-5 sm:!p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="dashboard-section-title">{title}</h2>
            {count !== undefined ? (
              <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-blue-600/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-blue-700 dark:bg-blue-500/20 dark:text-sky-200">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
