"use client"

import {
  bookingActionSelectClass,
  bookingNextActions,
  bookingStatusControlValue,
  bookingStatusLabel,
} from "@/lib/bookingStatus"

type Props = {
  status: string
  busy?: boolean
  onChange: (status: string) => void
  /** Quick next-step buttons; optional select limited to current + next actions. */
  showSelect?: boolean
  compact?: boolean
  ariaLabel?: string
}

function isTerminalVisitStatus(status: string) {
  return ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
    String(status || "").toUpperCase(),
  )
}

/** Shared visit status controls for clinic and doctor portals. */
export default function BookingStatusControls({
  status,
  busy = false,
  onChange,
  showSelect = true,
  compact = false,
  ariaLabel = "Visit status",
}: Props) {
  const value = bookingStatusControlValue(status)
  const locked = isTerminalVisitStatus(status)
  const actions = bookingNextActions(status)
  const btnPad = compact
    ? "min-h-9 rounded-md px-2.5 py-1 text-xs"
    : "min-h-10 rounded-lg px-3 py-1.5 text-xs sm:min-h-11 sm:text-sm"

  if (locked) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={ariaLabel}
      >
        <span
          className={`inline-flex items-center border-2 font-semibold ${btnPad} ${bookingActionSelectClass(value)}`}
          title="Closed appointments cannot be canceled or rescheduled"
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
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      {showSelect ? (
        <label className="inline-flex items-center gap-1.5">
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
      {actions.map((a) => (
        <button
          key={a.status}
          type="button"
          disabled={busy}
          onClick={() => onChange(a.status)}
          className={`border-2 font-semibold transition disabled:opacity-50 ${btnPad} ${bookingActionSelectClass(a.status)}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}
