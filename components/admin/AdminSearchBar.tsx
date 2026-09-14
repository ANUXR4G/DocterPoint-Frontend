"use client"

import { Icon } from "@/components"

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  className?: string
}

export default function AdminSearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search…",
  className = "",
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      className={`relative w-full sm:w-72 ${className}`}
    >
      <Icon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        pathClassName="stroke-current"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white pl-10 pr-4 text-sm shadow-sm transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-white/5"
      />
    </form>
  )
}
