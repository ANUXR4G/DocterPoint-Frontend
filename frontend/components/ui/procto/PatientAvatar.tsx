"use client"

import { resolveUploadUrl } from "@/lib/uploads"

type Props = {
  name?: string | null
  imgSrc?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const

/** Patient photo with initials fallback — used on doctor queue / visit / patients. */
export default function PatientAvatar({
  name,
  imgSrc,
  size = "md",
  className = "",
}: Props) {
  const src = resolveUploadUrl(imgSrc)
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?"

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name} photo` : "Patient photo"}
        className={`inline-flex shrink-0 rounded-full object-cover bg-slate-200 dark:bg-slate-700 ${SIZE[size]} ${className}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 font-bold text-white ${SIZE[size]} ${className}`}
      aria-hidden
    >
      {initial}
    </span>
  )
}
