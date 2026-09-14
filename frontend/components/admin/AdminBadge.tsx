import type { ReactNode } from "react"

export function AdminBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "green" | "amber" | "red" | "blue"
}) {
  const tones = {
    neutral:
      "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10",
    green:
      "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200",
    amber:
      "bg-amber-500/12 text-amber-900 ring-1 ring-amber-500/20 dark:text-amber-200",
    red: "bg-red-500/12 text-red-800 ring-1 ring-red-500/20 dark:text-red-300",
    blue: "bg-blue-500/10 text-blue-800 ring-1 ring-blue-500/20 dark:text-sky-200",
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function statusTone(
  status: string,
): "neutral" | "green" | "amber" | "red" | "blue" {
  const s = status.toUpperCase()
  if (["ACTIVE", "LIVE", "COMPLETED", "APPROVED", "SCHEDULED"].includes(s))
    return "green"
  if (
    [
      "PAST_DUE",
      "GRACE",
      "VERIFYING",
      "PENDING",
      "DRAFT",
      "IN_PROGRESS",
      "TEMPLATES_PENDING",
      "DISPLAY_NAME_PENDING",
    ].includes(s)
  )
    return "amber"
  if (["SUSPENDED", "CANCELLED", "REJECTED", "NO_SHOW", "CANCELED"].includes(s))
    return "red"
  if (["TRIALING", "ASSIGNED"].includes(s)) return "blue"
  return "neutral"
}

/** Card row for approval queues and similar lists. */
export function AdminListCard({
  title,
  meta,
  body,
  actions,
}: {
  title: ReactNode
  meta?: ReactNode
  body?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 transition hover:border-blue-200/80 hover:bg-white dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-blue-500/30 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
        {meta ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {meta}
          </p>
        ) : null}
        {body ? (
          <div className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {body}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
