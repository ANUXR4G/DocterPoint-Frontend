import Link from "next/link"
import type { ReactNode } from "react"
import { IconArrowLeft } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

type DashboardPageHeaderProps = {
  eyebrow?: string
  title: ReactNode
  subtitle?: string
  backHref?: string
  backLabel?: string
  action?: ReactNode
  /** Place actions under the title block (better for many CTAs). */
  actionBelow?: boolean
  className?: string
  compact?: boolean
}

export default function DashboardPageHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  action,
  actionBelow = false,
  className,
  compact = false,
}: DashboardPageHeaderProps) {
  return (
    <header className={cn("dashboard-hero", compact && "!min-h-0", className)}>
      <div aria-hidden className="dashboard-hero-glow" />
      <div className="relative">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition hover:text-blue-700 dark:text-sky-400"
          >
            <IconArrowLeft className="size-4" />
            {backLabel}
          </Link>
        ) : null}

        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-4",
            backHref ? "mt-4" : "",
          )}
        >
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                "font-bold tracking-tight text-slate-900 dark:text-white",
                eyebrow ? "mt-1" : "",
                compact
                  ? "text-xl sm:text-2xl"
                  : "text-2xl sm:text-3xl lg:text-4xl",
              )}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
                {subtitle}
              </p>
            ) : null}
            {action && actionBelow ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
                {action}
              </div>
            ) : null}
          </div>
          {action && !actionBelow ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {action}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
