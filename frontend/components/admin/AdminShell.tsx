import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  wide?: boolean
  className?: string
}

/** Consistent page wrapper for all admin routes (same width as doctor/clinic). */
export default function AdminShell({
  children,
  wide = true,
  className,
}: Props) {
  return (
    <div
      className={cn(
        wide ? "dashboard-page-wide" : "dashboard-page",
        className,
      )}
    >
      {children}
    </div>
  )
}
