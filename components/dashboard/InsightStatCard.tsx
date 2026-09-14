"use client"

import Link from "next/link"
import { Icon } from "@/components"
import type { IconNames } from "@/types"

type Tone = "blue" | "green" | "rose" | "amber"

const toneStyles: Record<Tone, { iconWrap: string; ring: string }> = {
  blue: {
    iconWrap: "bg-sky-100 text-blue-600 dark:bg-blue-500/20 dark:text-sky-300",
    ring: "group-hover:border-blue-200 dark:group-hover:border-blue-500/40",
  },
  green: {
    iconWrap:
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    ring: "group-hover:border-emerald-200 dark:group-hover:border-emerald-500/40",
  },
  rose: {
    iconWrap: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
    ring: "group-hover:border-rose-200 dark:group-hover:border-rose-500/40",
  },
  amber: {
    iconWrap:
      "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    ring: "group-hover:border-amber-200 dark:group-hover:border-amber-500/40",
  },
}

type Props = {
  title: string
  value: string | number
  subtitle: string
  href: string
  icon: IconNames
  tone?: Tone
  onNavigate?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    url: string,
  ) => void
}

function InsightStatCardBody({
  title,
  value,
  subtitle,
  icon,
  tone = "blue",
}: Pick<Props, "title" | "value" | "subtitle" | "icon" | "tone">) {
  const styles = toneStyles[tone]

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${styles.iconWrap}`}
        >
          <Icon name={icon} className="size-5" pathClassName="stroke-current" />
        </div>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:border-blue-300 group-hover:text-blue-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:group-hover:border-blue-500/50 dark:group-hover:text-sky-300">
          <Icon
            name="rotated-arrow"
            className="size-4"
            pathClassName="fill-current"
          />
        </span>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>
    </>
  )
}

export function InsightStatCard({
  title,
  value,
  subtitle,
  href,
  icon,
  tone = "blue",
  onNavigate,
}: Props) {
  const styles = toneStyles[tone]

  if (onNavigate) {
    return (
      <button
        type="button"
        className={`dashboard-insight-card group w-full text-start ${styles.ring}`}
        onClick={(e) => onNavigate(e, href)}
      >
        <InsightStatCardBody
          title={title}
          value={value}
          subtitle={subtitle}
          icon={icon}
          tone={tone}
        />
      </button>
    )
  }

  return (
    <Link
      href={href}
      className={`dashboard-insight-card group ${styles.ring}`}
    >
      <InsightStatCardBody
        title={title}
        value={value}
        subtitle={subtitle}
        icon={icon}
        tone={tone}
      />
    </Link>
  )
}
