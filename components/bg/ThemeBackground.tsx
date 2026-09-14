"use client"

import Background from "@/components/bg"
import { isCustomImageBg, presetNameFromBg } from "@/lib/themeBg"

type Props = {
  /** Resolved background: null = default, preset:*, or image URL */
  bgSrc?: string | null
  className?: string
}

/**
 * Renders dashboard ambient background from theme settings.
 * Custom images are clipped to the main content column (not under the sidebar).
 */
export default function ThemeBackground({ bgSrc, className }: Props) {
  if (isCustomImageBg(bgSrc)) {
    return (
      <div
        className={`pointer-events-none fixed inset-y-0 right-0 z-0 overflow-hidden left-0 md:left-[72px] xl:left-60 ${className ?? ""}`}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgSrc!}
          alt=""
          className="absolute inset-0 size-full object-cover object-center opacity-80 dark:opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/75 to-white/85 dark:from-[#090909]/70 dark:via-[#090909]/75 dark:to-[#090909]/85" />
      </div>
    )
  }

  const preset = presetNameFromBg(bgSrc)
  if (
    preset === "half-box-pattern" ||
    preset === "dotted-patern" ||
    preset === "gradient-1" ||
    preset === "gradient-2" ||
    preset === "gradient-3"
  ) {
    return <Background name={preset} className={className} />
  }

  return <Background name="gradient-2" className={className} />
}
