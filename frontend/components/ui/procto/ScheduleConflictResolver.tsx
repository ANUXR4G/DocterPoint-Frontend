"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  proctoService,
  type ScheduleAlertStatus,
  type ScheduleResolutionAction,
  type ScheduleResolutionActionType,
  type ScheduleResolutionItem,
  type ScheduleResolutionOutcome,
  type ScheduleResolutionPlan,
  type ScheduleSlotSuggestion,
} from "@/lib/services/procto"

type RowChoice = {
  type: ScheduleResolutionActionType
  slot: string
  toProviderId: string
  reason: string
  note: string
}

const ACTION_LABELS: Record<ScheduleResolutionActionType, string> = {
  RESCHEDULE: "Reschedule",
  REASSIGN: "Reassign to another doctor",
  CANCEL: "Cancel with reason",
  KEEP: "Keep as override slot",
}

const ALERT_LABELS: Partial<Record<ScheduleAlertStatus, string>> = {
  no_email: "no email on file",
  not_configured: "email not set up",
}

function alertLabel(s: ScheduleAlertStatus, applied: boolean): string {
  if (s === "queued") return applied ? "sent" : "will send"
  return ALERT_LABELS[s] ?? s
}

function slotKey(s: ScheduleSlotSuggestion): string {
  return s.slotStart ?? `token:${s.sessionDate}`
}

function defaultChoice(item: ScheduleResolutionItem): RowChoice {
  return {
    type: item.autoMatch ? "RESCHEDULE" : "KEEP",
    slot: item.autoMatch ? slotKey(item.autoMatch) : "",
    toProviderId: item.reassignTo[0]?.providerId ?? "",
    reason: "",
    note: "",
  }
}

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

/**
 * Explicit resolution step for visits a pending schedule clashes with:
 * reschedule to a suggested slot, reassign, cancel with a reason, or keep as
 * an override slot — reviewed (dry run) before anything is written.
 */
export function ScheduleConflictResolver({
  open,
  practiceId,
  providerId,
  onClose,
  onResolved,
}: {
  open: boolean
  practiceId: string
  providerId: string
  onClose: () => void
  onResolved: (message: string) => void
}) {
  const [plan, setPlan] = useState<ScheduleResolutionPlan | null>(null)
  const [loadError, setLoadError] = useState("")
  const [choices, setChoices] = useState<Record<string, RowChoice>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [bulkReason, setBulkReason] = useState("")
  const [bulkDoctor, setBulkDoctor] = useState("")
  const [review, setReview] = useState<ScheduleResolutionOutcome | null>(null)
  const [done, setDone] = useState<ScheduleResolutionOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    setLoadError("")
    setPlan(null)
    const res = await proctoService.getScheduleResolution(practiceId, providerId)
    if (res.status !== "successful" || !res.data) {
      setLoadError(res.message || "Could not load the clashing appointments.")
      return
    }
    setPlan(res.data)
    setChoices(Object.fromEntries(res.data.items.map((i) => [i.bookingId, defaultChoice(i)])))
    setSelected(new Set())
    setNotifyEmail(res.data.emailEnabled)
  }

  useEffect(() => {
    if (!open) return
    setReview(null)
    setDone(null)
    setError("")
    void load()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, practiceId, providerId])

  const items = plan?.items ?? []
  const doctors = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of items) for (const d of i.reassignTo) map.set(d.providerId, d.name)
    return [...map.entries()].map(([providerId, name]) => ({ providerId, name }))
  }, [items])

  function setChoice(id: string, patch: Partial<RowChoice>) {
    setReview(null)
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  }

  function bulk(apply: (item: ScheduleResolutionItem) => Partial<RowChoice> | null) {
    setReview(null)
    setChoices((prev) => {
      const next = { ...prev }
      for (const item of items) {
        if (!selected.has(item.bookingId)) continue
        const patch = apply(item)
        if (patch) next[item.bookingId] = { ...next[item.bookingId]!, ...patch }
      }
      return next
    })
  }

  function actions(): ScheduleResolutionAction[] {
    return items.map((item) => {
      const c = choices[item.bookingId] ?? defaultChoice(item)
      const base = {
        bookingId: item.bookingId,
        type: c.type,
        notifyWhatsApp,
        notifyEmail: notifyEmail && Boolean(plan?.emailEnabled),
      }
      if (c.type === "RESCHEDULE") {
        const s = item.suggestions.find((x) => slotKey(x) === c.slot)
        return { ...base, slotStart: s?.slotStart, sessionDate: s?.sessionDate }
      }
      if (c.type === "REASSIGN") return { ...base, toProviderId: c.toProviderId }
      if (c.type === "CANCEL") return { ...base, reason: c.reason.trim() }
      return { ...base, note: c.note.trim() || undefined }
    })
  }

  async function submit(dryRun: boolean) {
    setBusy(true)
    setError("")
    const res = await proctoService.resolveScheduleConflicts(practiceId, providerId, actions(), dryRun)
    setBusy(false)
    if (res.status !== "successful" || !res.data) {
      setError(res.message || "Could not apply the changes.")
      return
    }
    if (dryRun) setReview(res.data)
    else setDone(res.data)
  }

  function finish() {
    if (done) {
      const left = done.pendingVerification?.impact.total ?? 0
      onResolved(
        `${done.ok} appointment${done.ok === 1 ? "" : "s"} resolved` +
          (done.failed ? `, ${done.failed} could not be changed` : "") +
          (left
            ? `. ${left} still clash${left === 1 ? "es" : ""} with the new schedule.`
            : ". No clashes left — you can activate the new schedule."),
      )
    }
    onClose()
  }

  if (!open || typeof document === "undefined") return null
  const reviewById = new Map((done ?? review)?.results.map((r) => [r.bookingId, r]) ?? [])
  const allSelected = items.length > 0 && selected.size === items.length
  const reviewBlocked = Boolean(review && review.failed > 0)

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-resolver-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) finish()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2 id="schedule-resolver-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
          {done
            ? "Changes applied"
            : `Resolve ${items.length || ""} clashing appointment${items.length === 1 ? "" : "s"}`}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {done
            ? "Patients were alerted as shown. Appointments that failed are unchanged."
            : "Choose what happens to each visit. Suggested slots are the closest free times under the new schedule. Nothing changes until you review and confirm."}
        </p>

        {loadError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : !plan ? (
          <p className="mt-6 text-sm opacity-60">Finding the closest free slots…</p>
        ) : !items.length ? (
          <p className="mt-6 text-sm">No appointment clashes with the new schedule any more.</p>
        ) : (
          <>
            {!done ? (
              <div className="mt-4 space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800/50">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-1 inline-flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(items.map((i) => i.bookingId)) : new Set())
                      }
                    />
                    {selected.size ? `${selected.size} selected` : "Select all"}
                  </label>
                  <button
                    type="button"
                    disabled={!selected.size}
                    onClick={() =>
                      bulk((i) => (i.autoMatch ? { type: "RESCHEDULE", slot: slotKey(i.autoMatch) } : null))
                    }
                    className="min-h-9 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Reschedule to suggested
                  </button>
                  <button
                    type="button"
                    disabled={!selected.size}
                    onClick={() => bulk(() => ({ type: "KEEP" }))}
                    className="min-h-9 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-neutral-600"
                  >
                    Keep as override slots
                  </button>
                  {plan.canReassign && doctors.length ? (
                    <span className="inline-flex items-center gap-1">
                      <select
                        value={bulkDoctor}
                        onChange={(e) => setBulkDoctor(e.target.value)}
                        className="min-h-9 rounded-lg border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-600 dark:bg-neutral-900"
                        aria-label="Doctor for bulk reassign"
                      >
                        <option value="">Reassign to…</option>
                        {doctors.map((d) => (
                          <option key={d.providerId} value={d.providerId}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selected.size || !bulkDoctor}
                        onClick={() =>
                          bulk((i) =>
                            i.reassignTo.some((d) => d.providerId === bulkDoctor)
                              ? { type: "REASSIGN", toProviderId: bulkDoctor }
                              : null,
                          )
                        }
                        className="min-h-9 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-neutral-600"
                      >
                        Apply
                      </button>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <input
                      value={bulkReason}
                      onChange={(e) => setBulkReason(e.target.value)}
                      placeholder="Cancellation reason"
                      maxLength={250}
                      className="min-h-9 w-44 rounded-lg border border-neutral-300 bg-white px-2 text-xs dark:border-neutral-600 dark:bg-neutral-900"
                    />
                    <button
                      type="button"
                      disabled={!selected.size || bulkReason.trim().length < 3}
                      onClick={() => bulk(() => ({ type: "CANCEL", reason: bulkReason.trim() }))}
                      className="min-h-9 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40 dark:border-red-800 dark:text-red-300"
                    >
                      Cancel selected
                    </button>
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={notifyWhatsApp}
                      onChange={(e) => {
                        setReview(null)
                        setNotifyWhatsApp(e.target.checked)
                      }}
                    />
                    WhatsApp alert to patients
                  </label>
                  <label className={`inline-flex items-center gap-2 ${plan.emailEnabled ? "" : "opacity-50"}`}>
                    <input
                      type="checkbox"
                      disabled={!plan.emailEnabled}
                      checked={notifyEmail && plan.emailEnabled}
                      onChange={(e) => {
                        setReview(null)
                        setNotifyEmail(e.target.checked)
                      }}
                    />
                    Email alert{plan.emailEnabled ? " (patients with an email on file)" : " — email isn't set up on the server"}
                  </label>
                </div>
              </div>
            ) : null}

            <ul className="mt-3 min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border text-sm dark:divide-neutral-800 dark:border-neutral-700">
              {items.map((item) => {
                const c = choices[item.bookingId] ?? defaultChoice(item)
                const r = reviewById.get(item.bookingId)
                return (
                  <li key={item.bookingId} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                    <div className="flex gap-2">
                      {!done ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          aria-label={`Select ${item.patientName || "patient"}`}
                          checked={selected.has(item.bookingId)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(item.bookingId)
                              else next.delete(item.bookingId)
                              return next
                            })
                          }
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 dark:text-white">
                          {item.patientName || "Patient"} · {item.when}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{item.reason}</p>
                        {notifyEmail && plan.emailEnabled && !item.hasEmail && c.type !== "KEEP" && !done ? (
                          <p className="text-xs text-neutral-400">No email on file — WhatsApp only</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {done ? null : (
                        <select
                          value={c.type}
                          onChange={(e) => setChoice(item.bookingId, { type: e.target.value as ScheduleResolutionActionType })}
                          className={inputCls}
                          aria-label="Action"
                        >
                          {(Object.keys(ACTION_LABELS) as ScheduleResolutionActionType[])
                            .filter((t) => t !== "REASSIGN" || plan.canReassign)
                            .map((t) => (
                              <option key={t} value={t}>
                                {ACTION_LABELS[t]}
                              </option>
                            ))}
                        </select>
                      )}
                      {!done && c.type === "RESCHEDULE" ? (
                        item.suggestions.length ? (
                          <select
                            value={c.slot}
                            onChange={(e) => setChoice(item.bookingId, { slot: e.target.value })}
                            className={inputCls}
                            aria-label="New slot"
                          >
                            {!c.slot ? <option value="">Pick a slot…</option> : null}
                            {item.suggestions.map((s) => (
                              <option key={slotKey(s)} value={slotKey(s)}>
                                {s.label}
                                {item.autoMatch && slotKey(item.autoMatch) === slotKey(s) ? " (suggested)" : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            No free slot within 7 days under the new schedule — keep, reassign or cancel.
                          </p>
                        )
                      ) : null}
                      {!done && c.type === "REASSIGN" ? (
                        item.reassignTo.length ? (
                          <select
                            value={c.toProviderId}
                            onChange={(e) => setChoice(item.bookingId, { toProviderId: e.target.value })}
                            className={inputCls}
                            aria-label="Doctor"
                          >
                            {item.reassignTo.map((d) => (
                              <option key={d.providerId} value={d.providerId}>
                                {d.name} — same time
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            No other doctor is free at this time.
                          </p>
                        )
                      ) : null}
                      {!done && c.type === "CANCEL" ? (
                        <input
                          value={c.reason}
                          onChange={(e) => setChoice(item.bookingId, { reason: e.target.value })}
                          placeholder="Reason (sent to the patient by email; kept on the visit)"
                          maxLength={250}
                          className={inputCls}
                        />
                      ) : null}
                      {!done && c.type === "KEEP" ? (
                        <input
                          value={c.note}
                          onChange={(e) => setChoice(item.bookingId, { note: e.target.value })}
                          placeholder="Note for the team (optional)"
                          maxLength={250}
                          className={inputCls}
                        />
                      ) : null}
                      {r ? (
                        <p
                          className={`text-xs font-medium ${
                            r.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
                          }`}
                        >
                          {r.ok ? "✓" : "✗"} {r.message}
                          {r.ok && r.type !== "KEEP"
                            ? ` WhatsApp: ${alertLabel(r.whatsapp, Boolean(done))}; email: ${alertLabel(r.email, Boolean(done))}.`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
        {review && !done ? (
          <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-200">
            {reviewBlocked
              ? `${review.failed} appointment${review.failed === 1 ? " needs" : "s need"} a different choice (marked ✗).`
              : `Ready: ${review.ok} change${review.ok === 1 ? "" : "s"}. Patients are alerted as listed.`}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {done || !items.length ? (
            <button
              type="button"
              onClick={finish}
              className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={finish}
                disabled={busy}
                className="min-h-11 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200"
              >
                Back
              </button>
              {review && !reviewBlocked ? (
                <button
                  type="button"
                  onClick={() => void submit(false)}
                  disabled={busy}
                  className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Applying…" : `Confirm ${review.ok} change${review.ok === 1 ? "" : "s"}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit(true)}
                  disabled={busy || !plan}
                  className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Checking…" : "Review changes"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
