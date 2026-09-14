"use client"

import { cn } from "@/lib/utils"
import { IconMenu2, IconX } from "@tabler/icons-react"
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion"
import Link from "next/link"
import React, { useRef, useState } from "react"

/** SOLUNE design tokens (public chrome) — accent follows user theme */
const F = {
  canvas: "#f7f4f0",
  surface1: "#ffffff",
  surface2: "#faf8f5",
  hairline: "rgba(45, 42, 38, 0.08)",
  ink: "#2d2a26",
  inkMuted: "#8a8580",
  accent: "var(--theme-primary)",
  onPrimary: "#ffffff",
} as const

interface NavbarProps {
  children: React.ReactNode
  className?: string
  scrollYOverride?: number
}

interface NavBodyProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

interface MobileNavProps {
  children: React.ReactNode
  className?: string
  visible?: boolean
}

interface NavItemsProps {
  items: { name: string; link: string }[]
  className?: string
  onItemClick?: () => void
}

interface MobileNavHeaderProps {
  children: React.ReactNode
  className?: string
}

interface MobileNavMenuProps {
  children: React.ReactNode
  className?: string
  isOpen: boolean
  onClose: () => void
}

export const Navbar = ({
  children,
  className,
  scrollYOverride,
}: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const [visible, setVisible] = useState(false)

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (scrollYOverride == null) setVisible(latest > 80)
  })

  React.useEffect(() => {
    if (scrollYOverride == null) return
    setVisible(scrollYOverride > 80)
  }, [scrollYOverride])

  return (
    <motion.div
      ref={ref}
      className={cn(
        "fixed inset-x-0 top-0 z-[100] w-full overflow-x-clip text-neutral-900 dark:text-white",
        visible ? "pt-3 sm:pt-4" : "pt-0",
        className,
      )}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ visible?: boolean }>,
              { visible },
            )
          : child,
      )}
    </motion.div>
  )
}

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  return (
    <motion.div
      animate={{
        boxShadow: visible
          ? "0 8px 32px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.65)"
          : "inset 0 -0.5px 0 rgba(0,0,0,0.06)",
        width: visible ? "min(920px, 92%)" : "100%",
        borderRadius: visible ? 100 : 0,
      }}
      transition={{ type: "spring", stiffness: 200, damping: 50 }}
      className={cn(
        "relative z-[60] mx-auto hidden h-14 w-full max-w-[1199px] flex-row items-center justify-between self-start px-[15px] lg:flex",
        // iOS frosted glass
        "backdrop-blur-xl backdrop-saturate-150",
        "supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-[#242220]/55",
        "bg-[color-mix(in_srgb,#ffffff_78%,transparent)] dark:bg-[#242220]/78",
        visible
          ? "border border-white/60 dark:border-white/10"
          : "border-b border-black/[0.06] dark:border-white/[0.08]",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const NavItems = ({ items, className, onItemClick }: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "pointer-events-none absolute inset-0 hidden flex-1 flex-row items-center justify-center gap-1 text-[13px] font-medium tracking-[-0.13px] lg:flex",
        className,
      )}
    >
      {items.map((item, idx) => (
        <Link
          key={`link-${idx}`}
          href={item.link}
          onMouseEnter={() => setHovered(idx)}
          onClick={onItemClick}
          className="pointer-events-auto relative px-[14px] py-2 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-[#999999] dark:hover:text-white"
        >
          {hovered === idx && (
            <motion.div
              layoutId="hovered"
              className="absolute inset-0 h-full w-full rounded-full bg-black/[0.06] backdrop-blur-sm dark:bg-white/[0.1]"
            />
          )}
          <span className="relative z-20">{item.name}</span>
        </Link>
      ))}
    </motion.div>
  )
}

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  return (
    <motion.div
      animate={{
        boxShadow: visible
          ? "0 8px 32px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.55)"
          : "inset 0 -0.5px 0 rgba(0,0,0,0.06)",
        width: visible ? "90%" : "100%",
        paddingRight: visible ? "12px" : "15px",
        paddingLeft: visible ? "12px" : "15px",
        borderRadius: visible ? 20 : 0,
      }}
      transition={{ type: "spring", stiffness: 200, damping: 50 }}
      className={cn(
        "relative z-50 mx-auto flex h-14 w-full max-w-full flex-col items-center justify-center lg:hidden",
        "backdrop-blur-xl backdrop-saturate-150",
        "supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-[#242220]/55",
        "bg-[color-mix(in_srgb,#ffffff_78%,transparent)] dark:bg-[#242220]/78",
        visible
          ? "border border-white/60 dark:border-white/10"
          : "border-b border-black/[0.06] dark:border-white/[0.08]",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export const MobileNavHeader = ({
  children,
  className,
}: MobileNavHeaderProps) => {
  return (
    <div
      className={cn(
        "flex w-full flex-row items-center justify-between",
        className,
      )}
    >
      {children}
    </div>
  )
}

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
}: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={cn(
            "absolute inset-x-0 top-[3.5rem] z-50 flex w-full flex-col items-start justify-start gap-4 rounded-[20px] border border-white/50 px-4 py-8 text-neutral-900 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:text-white dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
            "supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-[#141414]/70",
            "bg-white/90 dark:bg-[#141414]/90",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const MobileNavToggle = ({
  isOpen,
  onClick,
  className,
}: {
  isOpen: boolean
  onClick: () => void
  className?: string
}) => {
  return isOpen ? (
    <IconX
      className={cn("cursor-pointer text-neutral-900 dark:text-white", className)}
      onClick={onClick}
      aria-label="Close menu"
    />
  ) : (
    <IconMenu2
      className={cn("cursor-pointer text-neutral-900 dark:text-white", className)}
      onClick={onClick}
      aria-label="Open menu"
    />
  )
}

export const NavbarLogo = () => {
  return (
    <Link
      href="/"
      className="relative z-20 mr-4 flex items-center gap-2 px-1 py-1 text-neutral-900 dark:text-white"
    >
      <span className="size-3.5 shrink-0 rounded-full bg-neutral-900 dark:bg-white" />
      <span className="text-[15px] font-medium tracking-[-0.45px]">
        GlucoGuide
      </span>
    </Link>
  )
}

export const NavbarButton = ({
  href,
  as: Tag = "a",
  children,
  className,
  variant = "primary",
  ...props
}: {
  href?: string
  as?: React.ElementType
  children: React.ReactNode
  className?: string
  variant?: "primary" | "secondary" | "dark" | "gradient"
} & (
  | React.ComponentPropsWithoutRef<"a">
  | React.ComponentPropsWithoutRef<"button">
)) => {
  const baseStyles =
    "relative inline-block cursor-pointer rounded-full px-[15px] py-[10px] text-center text-[14px] font-medium leading-none tracking-[-0.14px] transition duration-200 hover:scale-[0.98] active:scale-[0.96]"

  const variantStyles = {
    primary:
      "bg-[var(--solune-ink)] text-white dark:bg-white dark:text-[var(--solune-ink)]",
    secondary:
      "border border-[var(--solune-border-strong)] bg-[var(--solune-surface)] text-[var(--solune-ink)] dark:border-white/12 dark:bg-[#242220] dark:text-white",
    dark: "bg-[var(--solune-ink)] text-white",
    gradient:
      "bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)] shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--theme-primary)_55%,transparent)] hover:bg-[var(--theme-primary-hover)]",
  }

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseStyles, variantStyles[variant], className)}
        {...(props as React.ComponentPropsWithoutRef<"a">)}
      >
        {children}
      </Link>
    )
  }

  return (
    <Tag
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    >
      {children}
    </Tag>
  )
}
