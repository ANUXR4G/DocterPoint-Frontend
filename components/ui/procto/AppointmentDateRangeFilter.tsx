"use client"

import { CalendarDays } from "lucide-react"
import {
  APPOINTMENT_RANGE_PRESETS,
  formatIsoRange,
  type AppointmentRangePreset,
  type IsoRange,
} from "@/lib/appointmentDateRange"

type Props = {
  preset: AppointmentRangePreset
  onPresetChange: (preset: AppointmentRangePreset) => void
  custom: IsoRange
  onCustomChange: (range: IsoRange) => void
  /** Resolved range currently applied to the list. */
  range: IsoRange | null
  error?: string | null
  className?: string
}

const inputCls =
  "rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"

/** Date-range chips (Today … Last 6 months) + custom from/to calendar. */
export default function AppointmentDateRangeFilter({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  range,
  error,
  className = "",
}: Props) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Filter by appointment date"
      >
        <CalendarDays
          className="mr-1 size-4 text-neutral-500"
          aria-hidden
        />
        {APPOINTMENT_RANGE_PRESETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={preset === key}
            onClick={() => onPresetChange(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              preset === key
                ? "bg-[var(--theme-primary)] text-white"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
        {range && preset !== "custom" ? (
          <span className="ml-1 text-xs font-medium text-neutral-500">
            {formatIsoRange(range)}
          </span>
        ) : null}
      </div>

      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            From
            <input
              type="date"
              className={inputCls}
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) =>
                onCustomChange({ ...custom, from: e.target.value })
              }
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            To
            <input
              type="date"
              className={inputCls}
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) =>
                onCustomChange({ ...custom, to: e.target.value })
              }
            />
          </label>
          {error ? (
            <span className="text-xs font-semibold text-red-700 dark:text-red-400" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
