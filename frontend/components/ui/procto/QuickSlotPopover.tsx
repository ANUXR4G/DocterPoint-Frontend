"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  proctoService,
  type DayWindows,
  type ExtraSlotsResult,
} from "@/lib/services/procto"
import { practiceMinutesOfDay, practiceTodayIso } from "@/lib/practiceTime"
import {
  checkWindow,
  drName,
  hm12,
  suggestedStart,
  toHm,
  toMin,
} from "@/lib/quickSlots"

export type QuickSlotRequest = {
  providerId: string
  date: string
  /** Minutes past midnight; omitted → suggested after the day's last window. */
  start?: number
  end?: number
  /** Viewport rect the popover opens next to (the selection or the + Slot button). */
  anchor: { left: number; top: number; width: number; height: number }
}

const PANEL_W = 344
const PANEL_H = 430

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export default function QuickSlotPopover({
  practiceId,
  doctors,
  request,
  seed,
  onClose,
  onCreated,
}: {
  practiceId: string
  doctors: Array<{ id: string; name: string }>
  request: QuickSlotRequest
  /** Already-loaded day windows keyed `${providerId}:${date}`. */
  seed?: Record<string, DayWindows | undefined>
  onClose: () => void
  onCreated: (
    result: ExtraSlotsResult,
    target: { providerId: string; date: string },
  ) => void
}) {
  const [providerId, setProviderId] = useState(request.providerId)
  const [date, setDate] = useState(request.date)
  const [start, setStart] = useState(
    request.start != null ? toHm(request.start) : "",
  )
  const [end, setEnd] = useState(request.end != null ? toHm(request.end) : "")
  const [note, setNote] = useState("")
  const [day, setDay] = useState<DayWindows | undefined>(
    seed?.[`${request.providerId}:${request.date}`],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const firstField = useRef<HTMLSelectElement>(null)

  const today = practiceTodayIso()
  const nowMin = date === today ? practiceMinutesOfDay(new Date()) : undefined

  const seedRef = useRef(seed)
  seedRef.current = seed

  useEffect(() => {
    let alive = true
    const cached = seedRef.current?.[`${providerId}:${date}`]
    if (cached) setDay(cached)
    else setDay(undefined)
    void proctoService
      .getCalendarDay(practiceId, providerId, date)
      .then((res) => {
        if (!alive) return
        if (res.status === "successful" && res.data?.windows)
          setDay(res.data.windows)
        else if (!cached)
          setError(res.message || "Could not load the doctor's day.")
      })
    return () => {
      alive = false
    }
  }, [practiceId, providerId, date])

  useEffect(() => {
    if (!day || start) return
    const s = suggestedStart(day, nowMin)
    setStart(toHm(s))
    setEnd(toHm(s + day.slotIntervalMin))
  }, [day, start, nowMin])

  useLayoutEffect(() => {
    const a = request.anchor
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = a.left + a.width + 10
    if (left + PANEL_W > vw - 12) left = a.left - PANEL_W - 10
    if (left < 12) left = Math.max(12, Math.min(vw - PANEL_W - 12, a.left))
    const top = Math.max(12, Math.min(vh - PANEL_H - 12, a.top))
    setPos({ top, left })
    firstField.current?.focus()
  }, [request.anchor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onDown)
    }
  }, [onClose])

  const interval = day?.slotIntervalMin ?? 15
  const check = useMemo(
    () => checkWindow({ start, end }, day, nowMin),
    [start, end, day, nowMin],
  )

  function setLength(minutes: number) {
    const s = toMin(start)
    if (Number.isNaN(s)) return
    setEnd(toHm(Math.min(s + minutes, 24 * 60 - 1)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!check.ok || saving) return
    setSaving(true)
    setError("")
    const res = await proctoService.addExtraSlots(practiceId, {
      providerId,
      date,
      startTime: start,
      endTime: end,
      reason: note.trim() || undefined,
    })
    setSaving(false)
    if (res.status === "successful" && res.data) {
      onCreated(res.data, { providerId, date })
      return
    }
    setError(res.message || "Could not add the slots.")
  }

  const lengths: Array<[string, number]> = [
    ["1 slot", interval],
    ...([30, 60, 120] as const)
      .filter((m) => m > interval)
      .map((m): [string, number] => [m < 60 ? `${m} min` : `${m / 60} h`, m]),
  ]

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add slots"
      className="fixed z-[9999] w-[344px] rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold text-neutral-900 dark:text-white">
              Add slots
            </p>
            <p className="text-xs opacity-60">{formatDay(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm opacity-60 hover:bg-neutral-100 hover:opacity-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-semibold opacity-70">Doctor</span>
          <select
            ref={firstField}
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value)
              setError("")
            }}
            className="form-input w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {drName(d.name)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block text-sm">
            <span className="mb-1 block font-semibold opacity-70">Date</span>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => {
                if (!e.target.value) return
                setDate(e.target.value)
                setError("")
              }}
              className="form-input w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-600"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold opacity-70">From</span>
            <input
              type="time"
              value={start}
              step={interval * 60}
              onChange={(e) => {
                const prevLen = toMin(end) - toMin(start)
                setStart(e.target.value)
                const s = toMin(e.target.value)
                if (!Number.isNaN(s) && prevLen > 0) setEnd(toHm(s + prevLen))
                setError("")
              }}
              className="form-input w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-600"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold opacity-70">To</span>
            <input
              type="time"
              value={end}
              step={interval * 60}
              onChange={(e) => {
                setEnd(e.target.value)
                setError("")
              }}
              className="form-input w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-600"
            />
          </label>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Length"
        >
          {lengths.map(([label, m]) => {
            const active = toMin(end) - toMin(start) === m
            return (
              <button
                key={label}
                type="button"
                onClick={() => setLength(m)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white"
                    : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-semibold opacity-70">
            Note (optional)
          </span>
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Evening clinic"
            className="form-input w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600"
          />
        </label>

        {check.ok ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
            {check.slots} bookable {interval}-min slot
            {check.slots === 1 ? "" : "s"} · {hm12(start)}–{hm12(end)}
          </p>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {check.error}
          </p>
        )}
        {error ? (
          <p
            role="alert"
            className="text-sm font-semibold text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <p className="text-xs opacity-60">
          Bookable right away on the web, WhatsApp and at the desk. No patient
          is messaged.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!check.ok || saving}
            className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving
              ? "Adding…"
              : check.ok
                ? `Add ${check.slots} slot${check.slots === 1 ? "" : "s"}`
                : "Add slots"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
