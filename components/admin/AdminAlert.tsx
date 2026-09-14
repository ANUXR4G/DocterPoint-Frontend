import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Tone = "info" | "success" | "error"

const tones: Record<Tone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  error:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
}

export default function AdminAlert({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  if (!children) return null

  return (
    <p
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </p>
  )
}
