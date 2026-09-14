import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "danger" | "ghost"

const variants: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 dark:shadow-blue-900/30",
  secondary:
    "border border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-sky-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-blue-500/40",
  danger:
    "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
  ghost:
    "text-blue-600 hover:bg-blue-50 dark:text-sky-400 dark:hover:bg-blue-500/10",
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: Variant
  size?: "sm" | "md"
}

export default function AdminButton({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
