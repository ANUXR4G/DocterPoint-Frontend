"use client"

import {
  bookingActionSelectClass,
  bookingNextActions,
  bookingStatusControlValue,
  bookingStatusLabel,
  isTerminalVisitStatus,
} from "@/lib/bookingStatus"

/**
 * Keep these class strings in a component file so Tailwind's content scanner
 * always emits the dark-mode status utilities (lib/ alone was not scanned).
 */
void [
  "dark:bg-[#042f2e] dark:text-[#99f6e4] dark:border-[#2dd4bf]",
  "dark:bg-violet-950/40 dark:text-violet-100 dark:border-[#a78bfa]",
  "dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-700",
  "dark:bg-green-950/40 dark:text-green-100 dark:border-green-700",
  "dark:bg-red-950/40 dark:text-red-100 dark:border-red-700",
  "dark:bg-neutral-700 dark:text-neutral-100 dark:border-neutral-500",
  "dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-600",
]

type Props = {
  status: string
  busy?: boolean
  onChange: (status: string) => void
  /** Status dropdown; limited to current + valid next steps. */
  showSelect?: boolean
  /** Quick next-step buttons beside the select. */
  showActionButtons?: boolean
  compact?: boolean
  /** Keep select + action buttons on one horizontal row. */
  nowrap?: boolean
  ariaLabel?: string
}

/** Shared visit status controls for clinic and doctor portals. */
export default function BookingStatusControls({
  status,
  busy = false,
  onChange,
  showSelect = true,
  showActionButtons = true,
  compact = false,
  nowrap = false,
  ariaLabel = "Visit status",
}: Props) {
  const value = bookingStatusControlValue(status)
  const locked = isTerminalVisitStatus(status)
  const actions = bookingNextActions(status)
  const btnPad = compact
    ? "min-h-9 shrink-0 rounded-md px-2.5 py-1 text-xs"
    : "min-h-10 rounded-lg px-3 py-1.5 text-xs sm:min-h-11 sm:text-sm"
  const rowClass = nowrap
    ? "flex flex-nowrap items-center gap-1.5"
    : "flex flex-wrap items-center gap-2"
  const lockedTitle =
    String(status || "").toUpperCase() === "COMPLETED"
      ? "Completed — status cannot be changed"
      : "Closed appointments cannot be canceled or rescheduled"

  if (locked) {
    return (
      <div className={rowClass} role="group" aria-label={ariaLabel}>
        <span
          className={`inline-flex cursor-default items-center border-2 font-semibold opacity-90 ${btnPad} ${bookingActionSelectClass(value)}`}
          title={lockedTitle}
          aria-disabled="true"
        >
          {bookingStatusLabel(status)}
        </span>
      </div>
    )
  }

  // Select only offers current status + valid next steps (no wild jumps / reopen).
  const selectOptions = [
    { status: value, label: bookingStatusLabel(status) },
    ...actions
      .filter((a) => a.status !== value)
      .map((a) => ({
        status: a.status,
        label: bookingStatusLabel(a.status),
      })),
  ]

  return (
    <div className={rowClass} role="group" aria-label={ariaLabel}>
      {showSelect ? (
        <label className="inline-flex shrink-0 items-center gap-1.5">
          <span className="sr-only">Set status</span>
          <select
            value={value}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value !== value) onChange(e.target.value)
            }}
            className={`max-w-[11rem] border-2 font-semibold disabled:opacity-50 ${btnPad} ${bookingActionSelectClass(value)}`}
          >
            {selectOptions.map((o) => (
              <option key={o.status} value={o.status}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showActionButtons
        ? actions.map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={busy}
              onClick={() => onChange(a.status)}
              className={`border-2 font-semibold transition disabled:opacity-50 ${btnPad} ${bookingActionSelectClass(a.status)}`}
            >
              {a.label}
            </button>
          ))
        : null}
    </div>
  )
}
