"use client"

import { useDhakaArea } from "@/hooks/useDhakaArea"

type Props = {
  /** Controlled city value from parent (optional — hook owns state if omitted) */
  city?: string
  onCityChange?: (city: string) => void
  /** Detect GPS area once when mounted */
  autoDetect?: boolean
  className?: string
}

/**
 * Optional area chips + “Near me” using device GPS (no maps API).
 * When onCityChange is provided, parent owns the city filter; otherwise internal.
 */
export default function DhakaAreaPicker({
  city: controlledCity,
  onCityChange,
  autoDetect = false,
  className = "",
}: Props) {
  const internal = useDhakaArea(controlledCity ?? "", {
    autoDetect,
    onCityChange,
  })
  const city = controlledCity !== undefined ? controlledCity : internal.city
  const isDetecting = internal.isDetecting
  const message = internal.message

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void internal.detectNearMe()}
          disabled={isDetecting}
          className="rounded-full border border-[#0099ff]/40 bg-[#0099ff]/10 px-3.5 py-1.5 text-xs font-semibold text-[#0099ff] transition hover:bg-[#0099ff]/20 disabled:opacity-60"
        >
          {isDetecting ? "Detecting…" : "Near me"}
        </button>
        {city ? (
          <button
            type="button"
            onClick={() => internal.selectArea(null)}
            className="text-xs font-medium text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
          >
            Clear
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          {message}
        </p>
      ) : (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
          Filter by city, or allow location and tap Near me.
        </p>
      )}
    </div>
  )
}
