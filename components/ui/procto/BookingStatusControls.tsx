"use client"

import { useState } from "react"
import Link from "next/link"
import {
  bookingActionSelectClass,
  bookingNextActions,
  bookingStatusControlValue,
  bookingStatusLabel,
  isTerminalVisitStatus,
  type BookingStatusAction,
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
  onChange: (status: string, reason?: string) => void
  /** Where Finish opens the visit (remarks and medicines are saved there). */
  visitHref?: string
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
  visitHref,
  showSelect = true,
  showActionButtons = true,
  compact = false,
  nowrap = false,
  ariaLabel = "Visit status",
}: Props) {
  const value = bookingStatusControlValue(status)
  const locked = isTerminalVisitStatus(status)
  const actions = bookingNextActions(status)
  const [pending, setPending] = useState<BookingStatusAction | null>(null)
  const btnPad = compact
    ? "min-h-9 shrink-0 rounded-md px-2.5 py-1 text-xs"
    : "min-h-10 rounded-lg px-3 py-1.5 text-xs sm:min-h-11 sm:text-sm"
  const rowClass = nowrap
    ? "flex flex-nowrap items-center gap-1.5"
    : "flex flex-wrap items-center gap-2"
  const lockedTitle =
    String(status || "").toUpperCase() === "COMPLETED"
      ? "Finished — status cannot be changed"
      : "Closed appointments cannot be canceled or rescheduled"

  function request(action: BookingStatusAction) {
    if (action.opensVisit) return
    if (action.reasons?.length) {
      setPending(action)
      return
    }
    setPending(null)
    onChange(action.status)
  }

  function pickReason(reason: string) {
    if (!pending) return
    const next = pending.status
    setPending(null)
    onChange(next, reason)
  }

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

  const selectable = actions.filter((a) => !a.opensVisit && a.status !== value)
  const selectOptions = [
    { status: value, label: bookingStatusLabel(status) },
    ...selectable.map((a) => ({ status: a.status, label: a.label })),
  ]
  const finish = actions.find((a) => a.opensVisit)

  return (
    <div className={`relative ${rowClass}`} role="group" aria-label={ariaLabel}>
      {showSelect && selectable.length > 0 ? (
        <label className="inline-flex shrink-0 items-center gap-1.5">
          <span className="sr-only">Set status</span>
          <select
            value={value}
            disabled={busy}
            onChange={(e) => {
              const action = actions.find((a) => a.status === e.target.value)
              if (action) request(action)
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
      ) : showSelect ? (
        <span
          className={`inline-flex items-center border-2 font-semibold ${btnPad} ${bookingActionSelectClass(value)}`}
        >
          {bookingStatusLabel(status)}
        </span>
      ) : null}
      {showActionButtons
        ? actions.map((a) =>
            a.opensVisit && visitHref ? (
              <Link
                key={a.status}
                href={visitHref}
                className={`inline-flex items-center border-2 font-semibold ${btnPad} ${bookingActionSelectClass("COMPLETED")}`}
              >
                {a.label}
              </Link>
            ) : a.opensVisit ? null : (
              <button
                key={a.status}
                type="button"
                disabled={busy}
                onClick={() => request(a)}
                className={`border-2 font-semibold transition disabled:opacity-50 ${btnPad} ${bookingActionSelectClass(a.status)}`}
              >
                {a.label}
              </button>
            ),
          )
        : finish && visitHref ? (
            <Link
              href={visitHref}
              className={`inline-flex items-center border-2 font-semibold ${btnPad} ${bookingActionSelectClass("COMPLETED")}`}
            >
              {finish.label}
            </Link>
          ) : null}
      {pending?.reasons?.length ? (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-52 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-600 dark:bg-neutral-900">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {pending.label} — tap a reason
          </p>
          {pending.reasons.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={busy}
              onClick={() => pickReason(reason)}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-left text-xs font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              {reason}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPending(null)}
            className="px-2 py-1 text-left text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Keep
          </button>
        </div>
      ) : null}
    </div>
  )
}
