"use client"

import { motion } from "framer-motion"
import Link from "next/link"

type Props = {
  children: string
  className?: string
  href?: string
  onClick?: () => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
}

const MotionLink = motion(Link)

const labelVariants = {
  initial: { y: 0 },
  hovered: { y: "-100%" },
}

const overlayVariants = {
  initial: { y: "100%" },
  hovered: { y: 0 },
}

function FlipLabel({ children }: { children: string }) {
  return (
    <span className="relative block h-full w-full overflow-hidden">
      <motion.span
        className="flex h-full w-full items-center justify-center"
        variants={labelVariants}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.span>
      <motion.span
        className="absolute inset-0 flex h-full w-full items-center justify-center"
        variants={overlayVariants}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.span>
    </span>
  )
}

export default function FlipButton({
  children,
  className,
  href,
  onClick,
  type = "button",
  disabled,
}: Props) {
  const classes = `relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap ${className ?? ""}`

  if (href && !disabled) {
    return (
      <MotionLink
        href={href}
        initial="initial"
        whileHover="hovered"
        whileTap={{
          scale: 0.975,
          transition: { ease: "easeInOut", duration: 0.2 },
        }}
        className={classes}
      >
        <FlipLabel>{children}</FlipLabel>
      </MotionLink>
    )
  }

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      initial="initial"
      whileHover={disabled ? undefined : "hovered"}
      whileTap={
        disabled
          ? undefined
          : {
              scale: 0.975,
              transition: { ease: "easeInOut", duration: 0.2 },
            }
      }
      className={classes}
    >
      <FlipLabel>{children}</FlipLabel>
    </motion.button>
  )
}
