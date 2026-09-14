"use client"

import {
  completenessChartColor,
  completenessMessage,
  completenessToneClasses,
  PROFILE_FIELD_LABELS,
  type ProfileFieldKey,
} from "@/lib/profileCompleteness"

type ProfileCompletenessChartProps = {
  percent: number
  filled: number
  total: number
  missing?: ProfileFieldKey[]
  size?: number
  showDetails?: boolean
  className?: string
}

export default function ProfileCompletenessChart({
  percent,
  filled,
  total,
  missing = [],
  size = 160,
  showDetails = true,
  className = "",
}: ProfileCompletenessChartProps) {
  const clamped = Math.min(100, Math.max(0, percent))
  const color = completenessChartColor(clamped)
  const tone = completenessToneClasses(clamped)

  const stroke = 14
  const radius = (size - stroke) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const progress = (clamped / 100) * circumference
  const gap = circumference - progress

  return (
    <div
      className={`flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8 ${className}`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Profile ${clamped}% complete`}
        >
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-slate-200 dark:text-slate-700"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${gap}`}
            transform={`rotate(-90 ${center} ${center})`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
          {/* Filled pie wedge for stronger “pie” look below 100% */}
          {clamped > 0 && clamped < 100 ? (
            <path
              d={pieSlicePath(center, center, radius - stroke / 2, clamped)}
              fill={color}
              opacity={0.12}
            />
          ) : null}
          {clamped >= 100 ? (
            <circle
              cx={center}
              cy={center}
              r={radius - stroke / 2}
              fill={color}
              opacity={0.15}
            />
          ) : null}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-3xl font-bold tabular-nums leading-none ${tone.text}`}
          >
            {clamped}%
          </span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Complete
          </span>
        </div>
      </div>

      {showDetails ? (
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Profile completion
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {completenessMessage(clamped)}
          </p>
          <p className={`mt-2 text-xs font-medium ${tone.text}`}>
            {filled} of {total} fields filled
          </p>

          {missing.length > 0 && clamped < 100 ? (
            <ul className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {missing.slice(0, 5).map((key) => (
                <li
                  key={key}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone.bg} ${tone.border} ${tone.text}`}
                >
                  {PROFILE_FIELD_LABELS[key]}
                </li>
              ))}
              {missing.length > 5 ? (
                <li className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                  +{missing.length - 5} more
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** SVG path for a pie slice from 12 o'clock clockwise. */
function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  percent: number,
): string {
  if (percent <= 0) return ""
  if (percent >= 100) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  }
  const angle = (percent / 100) * 2 * Math.PI
  const x = cx + r * Math.sin(angle)
  const y = cy - r * Math.cos(angle)
  const largeArc = percent > 50 ? 1 : 0
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`
}
