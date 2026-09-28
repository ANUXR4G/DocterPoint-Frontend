"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import type { SchedulePreview, UpcomingScheduleChange } from "@/lib/services/procto"

const CLINIC_TZ = "Asia/Kolkata"
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Clinic-local today as YYYY-MM-DD. */
export function clinicTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ }).format(new Date())
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "Thu, 15 Oct 2026" */
export function formatScheduleDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function normalizeUpcomingChanges(data: unknown): UpcomingScheduleChange[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return []
  const list = (data as { upcomingChanges?: unknown }).upcomingChanges
  return Array.isArray(list) ? (list as UpcomingScheduleChange[]) : []
}

function summary(c: UpcomingScheduleChange): string {
  const mode = c.mode === "TOKEN_BASED" ? "Token queue" : "Time slots"
  const days = c.workingDays.map((d) => DAY_NAMES[d] ?? d).join(", ")
  const hours = c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : ""
  const brk =
    c.breakStartTime && c.breakEndTime
      ? `, break ${c.breakStartTime}–${c.breakEndTime}`
      : ""
  const slot =
    c.mode === "TIME_BASED" && c.slotIntervalMin ? `, ${c.slotIntervalMin}-min slots` : ""
  return [mode, days, hours].filter(Boolean).join(" · ") + brk + slot
}

export function EffectiveFromField({
  value,
  onChange,
  disabled,
  compact = false,
}: {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const today = clinicTodayIso()
  return (
    <label className="block">
      <span className={compact ? "text-xs opacity-70" : "gg-muted text-sm font-bold"}>
        Changes apply from *
      </span>
      <input
        type="date"
        min={today}
        max={addDaysIso(today, 366)}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || today)}
        className={
          compact
            ? "mt-1 w-full rounded-lg border px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            : "form-input mt-1 h-14 w-full px-4 text-base font-semibold"
        }
      />
      <span className={compact ? "mt-1 block text-xs opacity-50" : "gg-faint mt-1 block text-sm font-medium"}>
        Days before this keep the current schedule, so appointments already booked
        on them are not affected.
        {value > today ? ` New schedule starts ${formatScheduleDay(value)}.` : ""}
      </span>
    </label>
  )
}

export function UpcomingScheduleChanges({
  changes,
  cancellingDate,
  onCancel,
}: {
  changes: UpcomingScheduleChange[]
  cancellingDate?: string | null
  onCancel: (effectiveFrom: string) => void
}) {
  if (!changes.length) return null
  return (
    <div className="space-y-2">
      {changes.map((c) => (
        <div
          key={c.effectiveFrom}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p>
            Scheduled change from <strong>{formatScheduleDay(c.effectiveFrom)}</strong>:{" "}
            {summary(c)}. Until then the current schedule stays in force.
          </p>
          <button
            type="button"
            disabled={cancellingDate === c.effectiveFrom}
            onClick={() => onCancel(c.effectiveFrom)}
            className="min-h-9 rounded-lg border border-amber-400 px-3 py-1 font-semibold disabled:opacity-50 dark:border-amber-600"
          >
            {cancellingDate === c.effectiveFrom ? "Cancelling…" : "Cancel scheduled change"}
          </button>
        </div>
      ))}
    </div>
  )
}

/** Upcoming appointments the new schedule would no longer offer; bookings are never changed. */
export function ScheduleConflictModal({
  preview,
  busy = false,
  onApplyFrom,
  onApplyAnyway,
  onCancel,
}: {
  preview: SchedulePreview | null
  busy?: boolean
  onApplyFrom: (iso: string) => void
  onApplyAnyway: () => void
  onCancel: () => void
}) {
  const open = Boolean(preview)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!preview || typeof document === "undefined") return null
  const n = preview.conflicts.length
  const safe = preview.safeEffectiveFrom
  const canShift = safe > preview.effectiveFrom

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-conflict-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2
          id="schedule-conflict-title"
          className="text-lg font-semibold text-neutral-900 dark:text-white"
        >
          {n} booked appointment{n === 1 ? "" : "s"} fall outside the new schedule
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Starting {formatScheduleDay(preview.effectiveFrom)}, these visits would no
          longer match the working days or hours. They stay booked either way —
          nothing is cancelled or moved.
        </p>
        <ul className="mt-3 min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border text-sm dark:divide-neutral-800 dark:border-neutral-700">
          {preview.conflicts.map((c) => (
            <li key={c.bookingId} className="px-3 py-2">
              <p className="font-semibold text-neutral-900 dark:text-white">
                {c.patientName || "Patient"} · {c.when}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{c.reason}</p>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onApplyAnyway}
            disabled={busy}
            className="min-h-11 rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:border-amber-600 dark:text-amber-100"
          >
            Apply anyway
          </button>
          {canShift ? (
            <button
              type="button"
              onClick={() => onApplyFrom(safe)}
              disabled={busy}
              className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : `Apply from ${formatScheduleDay(safe)} instead`}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
