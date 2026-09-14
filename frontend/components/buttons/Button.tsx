"use client"

import { motion } from "framer-motion"

type Props = {
  type?: "primary" | "secondary" | "outline"
  typeBtn?: "button" | "submit" | "reset"
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

export default function Button({
  type = "primary",
  typeBtn = "button",
  onClick,
  children,
  className,
  disabled,
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type={typeBtn}
      disabled={disabled}
      className={`inline-flex items-center gap-x-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 ${className ?? ""} ${
        type === "primary"
          ? "border border-transparent bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)] shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--theme-primary)_55%,transparent)] hover:bg-[var(--theme-primary-hover)] hover:-translate-y-0.5"
          : type === "outline"
            ? "border border-[var(--solune-border-strong)] bg-[var(--solune-surface)] text-[var(--solune-ink)] shadow-[var(--solune-shadow-card)] hover:shadow-[var(--solune-shadow-soft)] dark:border-white/12 dark:bg-[#242220] dark:text-white"
            : type === "secondary"
              ? "border border-[var(--solune-border-strong)] bg-[var(--solune-surface-muted)] text-[var(--solune-ink)] dark:border-white/12 dark:bg-[#2e2b28] dark:text-white"
              : ""
      }`}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}
