"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ScheduleConflictResolver } from "./ScheduleConflictResolver"
import {
  proctoService,
  type PendingScheduleVerification,
  type ScheduleConflict,
  type ScheduleConflictCode,
  type ScheduleImpact,
  type ScheduleNotice,
  type SchedulePreview,
  type UpcomingScheduleChange,
} from "@/lib/services/procto"

const CONFLICT_LABELS: Record<ScheduleConflictCode, string> = {
  OUTSIDE_HOURS: "outside new hours",
  DAY_OFF: "on a day off",
  IN_BREAK: "in the new break",
  OFF_GRID: "off the new slot grid",
  MODE_CHANGED: "booking type changes",
  OVER_CAPACITY: "over the token limit",
}

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

export const NOTICE_HOUR_OPTIONS = [24, 48, 72, 168] as const

/** "48 hours'" / "7 days'" */
export function noticePeriodLabel(hours: number): string {
  return hours === 168 ? "7 days'" : `${hours} hours'`
}

export function discardedMessage(data: unknown): string {
  const sent = (data as { alerts?: { sent?: number } } | null)?.alerts?.sent ?? 0
  return (
    "Pending schedule discarded. The current schedule is unchanged." +
    (sent
      ? ` ${sent} patient${sent === 1 ? " whose visit was already changed was" : "s whose visits were already changed were"} notified.`
      : "")
  )
}

/** Clinic setting: minimum notice before a schedule change may affect a booked visit. */
export function NoticePeriodSelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (hours: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block min-w-0">
      <span className="gg-muted text-sm font-bold">Schedule change notice *</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="form-input mt-1 h-14 w-full px-4 text-base font-semibold"
      >
        {NOTICE_HOUR_OPTIONS.map((h) => (
          <option key={h} value={String(h)}>
            {h === 168 ? "7 days" : `${h} hours`}
          </option>
        ))}
      </select>
      <span className="gg-faint mt-1 block text-sm font-medium">
        A schedule change never affects a booked visit inside this period — it starts later
        instead.
      </span>
    </label>
  )
}

function NoticeNote({ notice, effectiveFrom }: { notice?: ScheduleNotice; effectiveFrom: string }) {
  if (!notice?.adjusted) return null
  const k = notice.blockedBy.length
  return (
    <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
      Starts <strong>{formatScheduleDay(effectiveFrom)}</strong> instead of{" "}
      {formatScheduleDay(notice.requestedFrom)}: booked patients get{" "}
      {noticePeriodLabel(notice.hours)} notice, and {k} visit{k === 1 ? "" : "s"} before then
      would have been affected.
    </p>
  )
}

export function normalizeUpcomingChanges(data: unknown): UpcomingScheduleChange[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return []
  const list = (data as { upcomingChanges?: unknown }).upcomingChanges
  return Array.isArray(list) ? (list as UpcomingScheduleChange[]) : []
}

export function normalizePendingVerification(data: unknown): PendingScheduleVerification | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const p = (data as { pendingVerification?: PendingScheduleVerification | null })
    .pendingVerification
  return p && typeof p === "object" && Array.isArray(p.conflicts) ? p : null
}

function impactOf(conflicts: ScheduleConflict[], impact?: ScheduleImpact): ScheduleImpact {
  if (impact) return impact
  const byCode: ScheduleImpact["byCode"] = {}
  for (const c of conflicts) byCode[c.code] = (byCode[c.code] ?? 0) + 1
  const days = [...new Set(conflicts.map((c) => c.day))].sort()
  return {
    total: conflicts.length,
    days: days.length,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    byCode,
  }
}

export function ImpactChips({ impact }: { impact: ScheduleImpact }) {
  const entries = Object.entries(impact.byCode) as [ScheduleConflictCode, number][]
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([code, n]) => (
        <span
          key={code}
          className="rounded-full border border-amber-300 bg-amber-100/70 px-2.5 py-0.5 text-xs font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
        >
          {n} {CONFLICT_LABELS[code] ?? code}
        </span>
      ))}
      {impact.days > 1 && impact.firstDay && impact.lastDay ? (
        <span className="px-1 py-0.5 text-xs opacity-70">
          across {impact.days} days ({formatScheduleDay(impact.firstDay)} –{" "}
          {formatScheduleDay(impact.lastDay)})
        </span>
      ) : null}
    </div>
  )
}

function ConflictList({ conflicts }: { conflicts: ScheduleConflict[] }) {
  return (
    <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border text-sm dark:divide-neutral-800 dark:border-neutral-700">
      {conflicts.map((c) => (
        <li key={c.bookingId} className="px-3 py-2">
          <p className="font-semibold text-neutral-900 dark:text-white">
            {c.patientName || "Patient"} · {c.when}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{c.reason}</p>
        </li>
      ))}
    </ul>
  )
}

/**
 * A saved schedule held back because it clashes with booked visits. The slot
 * engine keeps the current schedule until someone activates it here.
 */
export function PendingVerificationPanel({
  pending,
  busy = false,
  onActivate,
  onDiscard,
  resolver,
  openResolverSignal = 0,
}: {
  pending: PendingScheduleVerification | null
  busy?: boolean
  onActivate: (effectiveFrom?: string) => void
  onDiscard: () => void
  /** Enables the "Resolve appointments" step (reschedule / reassign / cancel / keep). */
  resolver?: { practiceId: string; providerId: string; onResolved: (message: string) => void }
  /** Bump to open the resolver, e.g. right after a clashing save. */
  openResolverSignal?: number
}) {
  const [confirming, setConfirming] = useState(false)
  const [showList, setShowList] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [sendingAlerts, setSendingAlerts] = useState(false)
  useEffect(() => setConfirming(false), [pending?.effectiveFrom, pending?.impact.total])
  useEffect(() => {
    if (openResolverSignal && resolver) setResolving(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openResolverSignal])
  if (!pending) return null
  const n = pending.impact.total
  const held = pending.heldAlerts ?? 0
  const canShift = pending.safeEffectiveFrom > pending.effectiveFrom

  async function sendHeldAlerts() {
    if (!resolver) return
    setSendingAlerts(true)
    const res = await proctoService.sendHeldScheduleAlerts(resolver.practiceId, resolver.providerId)
    setSendingAlerts(false)
    const sent = res.data?.sent ?? 0
    resolver.onResolved(
      res.status === "successful"
        ? `${sent} patient alert${sent === 1 ? "" : "s"} sent.`
        : res.message || "Could not send the patient alerts.",
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="text-xs font-bold uppercase tracking-[0.12em]">Pending verification</p>
      <p>
        New schedule from <strong>{formatScheduleDay(pending.effectiveFrom)}</strong>:{" "}
        {summary(pending.summary)}.{" "}
        {n
          ? `It clashes with ${n} booked appointment${n === 1 ? "" : "s"}, so the current schedule stays in force until you activate it.`
          : "No booked appointment clashes any more — it is ready to activate."}
      </p>
      <NoticeNote notice={pending.notice} effectiveFrom={pending.effectiveFrom} />
      {n ? <ImpactChips impact={pending.impact} /> : null}
      {n ? (
        <button
          type="button"
          onClick={() => setShowList((v) => !v)}
          className="text-xs font-semibold underline underline-offset-2"
        >
          {showList ? "Hide appointments" : `Show ${n} appointment${n === 1 ? "" : "s"}`}
        </button>
      ) : null}
      {showList && n ? (
        <div className="flex max-h-64 flex-col bg-white/60 dark:bg-neutral-900/60">
          <ConflictList conflicts={pending.conflicts} />
        </div>
      ) : null}
      <p className="text-xs opacity-80">
        {n
          ? resolver
            ? "Resolve the clashing visits (reschedule, reassign, cancel, or keep as override slots). Patients are messaged only once every clash is resolved; activating anyway asks the remaining patients on WhatsApp / email to pick a new time."
            : "Reschedule the listed patients first. Activating anyway asks the remaining patients on WhatsApp / email to pick a new time."
          : ""}
        {pending.submittedBy ? ` Submitted by ${pending.submittedBy}.` : ""}
      </p>
      {held > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-neutral-900/60">
          <span>
            {held} patient alert{held === 1 ? " is" : "s are"} waiting — sent when every clash is
            resolved, the schedule is activated or discarded, or at the latest a day before the
            notice period reaches the visit.
          </span>
          {resolver ? (
            <button
              type="button"
              disabled={busy || sendingAlerts}
              onClick={() => void sendHeldAlerts()}
              className="min-h-8 rounded-lg border border-amber-500 px-2.5 py-1 font-semibold disabled:opacity-50"
            >
              {sendingAlerts ? "Sending…" : "Send now"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {n && resolver ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setResolving(true)}
            className="min-h-9 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Resolve {n} appointment{n === 1 ? "" : "s"}
          </button>
        ) : null}
        {canShift ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onActivate(pending.safeEffectiveFrom)}
            className="min-h-9 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Activate from {formatScheduleDay(pending.safeEffectiveFrom)} (no clashes)
          </button>
        ) : null}
        {n && !confirming ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="min-h-9 rounded-lg border border-amber-500 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Activate from {formatScheduleDay(pending.effectiveFrom)} anyway
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onActivate()}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              n
                ? "bg-amber-600 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            {busy
              ? "Activating…"
              : n
                ? `Confirm — ask ${n} patient${n === 1 ? "" : "s"} to pick a new time`
                : `Activate from ${formatScheduleDay(pending.effectiveFrom)}`}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="min-h-9 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200"
        >
          Discard
        </button>
      </div>
      {resolver ? (
        <ScheduleConflictResolver
          open={resolving}
          practiceId={resolver.practiceId}
          providerId={resolver.providerId}
          onClose={() => setResolving(false)}
          onResolved={resolver.onResolved}
        />
      ) : null}
    </div>
  )
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
  noticeHours,
}: {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  compact?: boolean
  /** Clinic's lead time for changes that affect booked visits. */
  noticeHours?: number
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
        {noticeHours
          ? ` A change that affects booked visits starts only after the clinic's ${noticePeriodLabel(noticeHours)} notice period.`
          : ""}
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
  onSavePending,
  onCancel,
}: {
  preview: SchedulePreview | null
  busy?: boolean
  onApplyFrom: (iso: string) => void
  onSavePending: () => void
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
  const notice = preview.notice

  if (!n && notice?.adjusted) {
    return createPortal(
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-notice-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel()
        }}
      >
        <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          <h2 id="schedule-notice-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            Booked patients need {noticePeriodLabel(notice.hours)} notice
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Starting {formatScheduleDay(notice.requestedFrom)} would affect these visits inside the
            notice period, so the new schedule can start{" "}
            <strong>{formatScheduleDay(preview.effectiveFrom)}</strong> at the earliest. Nothing is
            cancelled or moved.
          </p>
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <ConflictList conflicts={notice.blockedBy} />
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
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
              onClick={() => onApplyFrom(preview.effectiveFrom)}
              disabled={busy}
              className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : `Apply from ${formatScheduleDay(preview.effectiveFrom)}`}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

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
          longer match the schedule. Nothing is cancelled or moved: start later, or
          save it as <strong>Pending verification</strong> — the current schedule
          stays in force until you activate it.
        </p>
        <div className="mt-3 space-y-2">
          <NoticeNote notice={notice} effectiveFrom={preview.effectiveFrom} />
          <ImpactChips impact={impactOf(preview.conflicts, preview.impact)} />
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <ConflictList conflicts={preview.conflicts} />
        </div>
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
            onClick={onSavePending}
            disabled={busy}
            className="min-h-11 rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:border-amber-600 dark:text-amber-100"
          >
            Save as pending verification
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
