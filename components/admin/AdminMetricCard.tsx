import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  value: string
  hint?: string
  change?: number
  changeLabel?: string
  icon?: ReactNode
  tone?: "blue" | "green" | "amber" | "rose"
  loading?: boolean
}

const toneStyles = {
  blue: "from-sky-500/10 to-blue-600/5 border-sky-200/80 dark:border-sky-500/25",
  green: "from-emerald-500/10 to-emerald-600/5 border-emerald-200/80 dark:border-emerald-500/25",
  amber: "from-amber-500/10 to-amber-600/5 border-amber-200/80 dark:border-amber-500/25",
  rose: "from-rose-500/10 to-rose-600/5 border-rose-200/80 dark:border-rose-500/25",
}

export default function AdminMetricCard({
  label,
  value,
  hint,
  change,
  changeLabel = "vs last month",
  icon,
  tone = "blue",
  loading = false,
}: Props) {
  const positive = change !== undefined && change >= 0
  const neutral = change === 0

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[20px] border bg-gradient-to-br p-5 shadow-sm",
        toneStyles[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            {label}
          </p>
          {loading ? (
            <div className="mt-3 h-9 w-32 animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {value}
            </p>
          )}
          {hint ? (
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {hint}
            </p>
          ) : null}
        </div>
        {icon ? (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-blue-600 shadow-sm dark:bg-white/10 dark:text-sky-300">
            {icon}
          </div>
        ) : null}
      </div>
      {change !== undefined && !loading ? (
        <div className="mt-4 flex items-center gap-2 border-t border-slate-200/60 pt-3 dark:border-white/10">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold",
              neutral
                ? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                : positive
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:text-red-300",
            )}
          >
            {positive && !neutral ? "↑" : !neutral ? "↓" : "—"} {Math.abs(change)}%
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{changeLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}
