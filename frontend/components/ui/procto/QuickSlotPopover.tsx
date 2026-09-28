"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  proctoService,
  type DayWindows,
  type ExtraSlotsPlan,
  type ExtraSlotsRequest,
  type ExtraSlotsResult,
  type SlotWarning,
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

const PANEL_W = 384
const PANEL_H = 640
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
/** Mon-first chip order. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const REASON_TAGS = ["Overtime", "Walk-in overflow", "VIP session"]
const MAX_CAPACITY = 20
const WARNING_LABEL: Record<SlotWarning["code"], string> = {
  leave: "on leave",
  offDay: "off duty",
  break: "break time",
  blocked: "blocked time",
}

function isoDate(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`)
}

function addDays(iso: string, days: number) {
  const d = isoDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(iso: string, months: number) {
  const d = isoDate(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

const weekdayOf = (iso: string) => isoDate(iso).getUTCDay()

function formatDay(iso: string, withWeekday = true) {
  return isoDate(iso).toLocaleDateString("en-GB", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white"
          : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  )
}

const fieldClass =
  "form-input w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-600"
const labelClass = "mb-1 block text-sm font-semibold opacity-70"

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
  const [mode, setMode] = useState<"single" | "repeat">("single")
  const [weekdays, setWeekdays] = useState<number[]>([weekdayOf(request.date)])
  const [until, setUntil] = useState(addDays(request.date, 27))
  /** null = the doctor's usual slot length. */
  const [customLength, setCustomLength] = useState<number | null>(null)
  const [capacity, setCapacity] = useState(1)
  const [plan, setPlan] = useState<ExtraSlotsPlan | null>(null)
  const [planError, setPlanError] = useState("")
  const [planning, setPlanning] = useState(false)
  const [day, setDay] = useState<DayWindows | undefined>(
    seed?.[`${request.providerId}:${request.date}`],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState<{
    message: string
    details: string[]
  } | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const firstField = useRef<HTMLButtonElement>(null)

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
    const h = Math.min(PANEL_H, vh - 24)
    let left = a.left + a.width + 10
    if (left + PANEL_W > vw - 12) left = a.left - PANEL_W - 10
    if (left < 12) left = Math.max(12, Math.min(vw - PANEL_W - 12, a.left))
    const top = Math.max(12, Math.min(vh - h - 12, a.top))
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

  const usual = day?.slotIntervalMin ?? 15
  const length = customLength ?? usual
  const check = useMemo(
    () => checkWindow({ start, end }, day, nowMin, length),
    [start, end, day, nowMin, length],
  )

  const body = useMemo((): ExtraSlotsRequest => {
    return {
      providerId,
      date,
      startTime: start,
      endTime: end,
      reason: note.trim() || undefined,
      slotIntervalMin: customLength ?? undefined,
      capacity: capacity > 1 ? capacity : undefined,
      repeat: mode === "repeat" ? { weekdays, until } : undefined,
    }
  }, [
    providerId,
    date,
    start,
    end,
    note,
    customLength,
    capacity,
    mode,
    weekdays,
    until,
  ])

  useEffect(() => {
    setConfirming(null)
  }, [body])
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  const repeatKey =
    mode === "repeat"
      ? JSON.stringify({ ...body, reason: undefined, capacity: undefined })
      : ""
  const bodyRef = useRef(body)
  bodyRef.current = body
  useEffect(() => {
    if (!repeatKey) {
      setPlan(null)
      setPlanError("")
      return
    }
    const s = toMin(bodyRef.current.startTime)
    const e = toMin(bodyRef.current.endTime)
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
      setPlan(null)
      setPlanError("End time must be after the start time.")
      return
    }
    let alive = true
    setPlanning(true)
    const t = window.setTimeout(() => {
      void proctoService
        .previewExtraSlots(practiceId, bodyRef.current)
        .then((res) => {
          if (!alive) return
          setPlanning(false)
          if (res.status === "successful" && res.data) {
            setPlan(res.data)
            setPlanError("")
          } else {
            setPlan(null)
            setPlanError(res.message || "Could not check those days.")
          }
        })
    }, 350)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [repeatKey, practiceId])

  function changeDate(next: string) {
    if (!next) return
    const prevWd = weekdayOf(date)
    if (weekdays.length === 1 && weekdays[0] === prevWd)
      setWeekdays([weekdayOf(next)])
    if (until < next) setUntil(addDays(next, 27))
    setDate(next)
    setError("")
  }

  function setLength(minutes: number) {
    const s = toMin(start)
    if (Number.isNaN(s)) return
    setEnd(toHm(Math.min(s + minutes, 24 * 60 - 1)))
  }

  const canSubmit =
    !saving && (mode === "single" ? check.ok : Boolean(plan?.dates.length))

  async function save(confirm: boolean) {
    if (!canSubmit) return
    setSaving(true)
    setError("")
    const res = await proctoService.addExtraSlots(practiceId, {
      ...body,
      confirm: confirm || undefined,
    })
    setSaving(false)
    if (res.status === "successful" && res.data) {
      const data = res.data
      if ("needsConfirmation" in data) {
        const repeat = mode === "repeat"
        setConfirming({
          message: data.message,
          details: [
            ...new Set(
              data.warnings.map((w) =>
                repeat ? `${formatDay(w.date)} — ${w.detail}` : w.detail,
              ),
            ),
          ].slice(0, 6),
        })
        return
      }
      onCreated(data, { providerId, date })
      return
    }
    setConfirming(null)
    setError(res.message || "Could not add the slots.")
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirming) void save(false)
  }

  const lengths: Array<[string, number]> = [
    ["1 slot", length],
    ...([30, 60, 120] as const)
      .filter((m) => m > length)
      .map((m): [string, number] => [m < 60 ? `${m} min` : `${m / 60} h`, m]),
  ]
  const slotLengths = [...new Set([usual, 10, 15, 20, 30])].sort(
    (a, b) => a - b,
  )
  const untilChips: Array<[string, string]> = [
    ["4 weeks", addDays(date, 27)],
    ["3 months", addMonths(date, 3)],
    ["6 months", addMonths(date, 6)],
  ]
  const perSlot = capacity > 1 ? ` · up to ${capacity} patients each` : ""
  const doctorName = drName(
    doctors.find((d) => d.id === providerId)?.name ?? "Doctor",
  )

  let submitLabel = "Add slots"
  if (saving) submitLabel = "Adding…"
  else if (mode === "single" && check.ok)
    submitLabel = `Add ${check.slots} slot${check.slots === 1 ? "" : "s"}`
  else if (mode === "repeat" && plan?.dates.length)
    submitLabel = `Add on ${plan.dates.length} day${plan.dates.length === 1 ? "" : "s"}`

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add slots"
      className="fixed z-[9999] w-[384px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900"
      style={{ top: pos.top, left: pos.left, maxHeight: "calc(100vh - 24px)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold text-neutral-900 dark:text-white">
              Add slots
            </p>
            <p className="text-xs opacity-60">
              {mode === "single"
                ? formatDay(date)
                : `${formatDay(date)} – ${formatDay(until)}`}
            </p>
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

        {doctors.length > 1 ? (
          <label className="block text-sm">
            <span className={labelClass}>Doctor</span>
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value)
                setError("")
              }}
              className={`${fieldClass} px-3`}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {drName(d.name)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm">
            <span className="font-semibold opacity-70">Doctor: </span>
            <span className="font-semibold">{doctorName}</span>
          </p>
        )}

        <div
          role="radiogroup"
          aria-label="Slot type"
          className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
        >
          {(
            [
              ["single", "Extra / walk-in", "This day only"],
              ["repeat", "Extend schedule", "Repeat on days"],
            ] as const
          ).map(([value, title, sub], i) => (
            <button
              key={value}
              ref={i === 0 ? firstField : undefined}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => {
                setMode(value)
                setError("")
              }}
              className={`rounded-lg px-2 py-1.5 text-left transition ${
                mode === value
                  ? "bg-white shadow-sm dark:bg-neutral-900"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <span className="block text-sm font-bold">{title}</span>
              <span className="block text-[11px] opacity-70">{sub}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label
            className={`block text-sm ${mode === "single" ? "col-span-2" : ""}`}
          >
            <span className={labelClass}>
              {mode === "single" ? "Date" : "Starting"}
            </span>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => changeDate(e.target.value)}
              className={fieldClass}
            />
          </label>
          {mode === "repeat" ? (
            <label className="block text-sm">
              <span className={labelClass}>Until</span>
              <input
                type="date"
                value={until}
                min={date}
                max={addDays(date, 365)}
                onChange={(e) => e.target.value && setUntil(e.target.value)}
                className={fieldClass}
              />
            </label>
          ) : null}
        </div>

        {mode === "repeat" ? (
          <div className="space-y-2">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Until"
            >
              {untilChips.map(([label, iso]) => (
                <Chip
                  key={label}
                  active={until === iso}
                  onClick={() => setUntil(iso)}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <div>
              <span className={labelClass}>Repeat on</span>
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Repeat on"
              >
                {WEEKDAY_ORDER.map((d) => (
                  <Chip
                    key={d}
                    label={WEEKDAYS[d]}
                    active={weekdays.includes(d)}
                    onClick={() =>
                      setWeekdays((prev) =>
                        prev.includes(d)
                          ? prev.filter((x) => x !== d)
                          : [...prev, d],
                      )
                    }
                  >
                    {WEEKDAYS[d].slice(0, 2)}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className={labelClass}>From</span>
            <input
              type="time"
              value={start}
              step={300}
              onChange={(e) => {
                const prevLen = toMin(end) - toMin(start)
                setStart(e.target.value)
                const s = toMin(e.target.value)
                if (!Number.isNaN(s) && prevLen > 0) setEnd(toHm(s + prevLen))
                setError("")
              }}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className={labelClass}>To</span>
            <input
              type="time"
              value={end}
              step={300}
              onChange={(e) => {
                setEnd(e.target.value)
                setError("")
              }}
              className={fieldClass}
            />
          </label>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Length"
        >
          {lengths.map(([label, m]) => (
            <Chip
              key={label}
              active={toMin(end) - toMin(start) === m}
              onClick={() => setLength(m)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <span className={labelClass}>Slot length</span>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Slot length"
            >
              {slotLengths.map((m) => (
                <Chip
                  key={m}
                  active={length === m}
                  label={m === usual ? `${m} minutes (usual)` : `${m} minutes`}
                  onClick={() => setCustomLength(m === usual ? null : m)}
                >
                  {m}m{m === usual ? " ·usual" : ""}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <span className={labelClass}>Patients / slot</span>
            <div className="flex items-center rounded-xl border border-neutral-300 dark:border-neutral-600">
              <button
                type="button"
                aria-label="Fewer patients per slot"
                disabled={capacity <= 1}
                onClick={() => setCapacity((c) => Math.max(1, c - 1))}
                className="px-2.5 py-1.5 text-sm font-bold disabled:opacity-30"
              >
                −
              </button>
              <span
                className="w-6 text-center text-sm font-bold"
                aria-live="polite"
                aria-label={`${capacity} patient${capacity === 1 ? "" : "s"} per slot`}
              >
                {capacity}
              </span>
              <button
                type="button"
                aria-label="More patients per slot"
                disabled={capacity >= MAX_CAPACITY}
                onClick={() =>
                  setCapacity((c) => Math.min(MAX_CAPACITY, c + 1))
                }
                className="px-2.5 py-1.5 text-sm font-bold disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        </div>
        {capacity > 1 ? (
          <p className="-mt-1 text-xs opacity-70">
            Queue slot — up to {capacity} patients can book each time.
          </p>
        ) : null}

        <div>
          <span className={labelClass}>Reason (optional)</span>
          <div
            className="mb-1.5 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Reason"
          >
            {REASON_TAGS.map((tag) => (
              <Chip
                key={tag}
                active={note === tag}
                onClick={() => setNote((n) => (n === tag ? "" : tag))}
              >
                {tag}
              </Chip>
            ))}
          </div>
          <input
            value={note}
            maxLength={200}
            aria-label="Reason"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Or type a short note"
            className={`${fieldClass} px-3`}
          />
        </div>

        {mode === "single" ? (
          check.ok ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
              {check.slots} bookable {length}-min slot
              {check.slots === 1 ? "" : "s"} · {hm12(start)}–{hm12(end)}
              {perSlot}
              {check.warnings.map((w) => (
                <span
                  key={w.code}
                  className="mt-1 block text-xs font-medium text-amber-800 dark:text-amber-200"
                >
                  ⚠ {w.message} {w.detail}.
                </span>
              ))}
            </p>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              {check.error}
            </p>
          )
        ) : planError ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            {planError}
          </p>
        ) : !plan ? (
          <p className="rounded-xl border border-neutral-200 px-3 py-2 text-sm opacity-70 dark:border-neutral-700">
            Checking those days…
          </p>
        ) : (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              plan.dates.length
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            } ${planning ? "opacity-60" : ""}`}
          >
            {plan.dates.length ? (
              <p className="font-semibold">
                {hm12(start)}–{hm12(end)} on {plan.dates.length} day
                {plan.dates.length === 1 ? "" : "s"} · {plan.dates[0].slots}{" "}
                slot{plan.dates[0].slots === 1 ? "" : "s"} each{perSlot}
              </p>
            ) : (
              <p className="font-semibold">
                None of those days can take these slots.
              </p>
            )}
            {plan.dates.length ? (
              <p className="text-xs opacity-80">
                {plan.dates
                  .slice(0, 6)
                  .map((d) => formatDay(d.date, false))
                  .join(", ")}
                {plan.dates.length > 6 ? ` +${plan.dates.length - 6} more` : ""}
              </p>
            ) : null}
            {plan.dates.some((d) => d.warnings.length) ? (
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                {plan.dates
                  .filter((d) => d.warnings.length)
                  .slice(0, 4)
                  .map((d) => (
                    <li key={d.date}>
                      ⚠ {formatDay(d.date)} —{" "}
                      {d.warnings.map((w) => WARNING_LABEL[w.code]).join(", ")}
                    </li>
                  ))}
                {plan.dates.filter((d) => d.warnings.length).length > 4 ? (
                  <li>
                    +{plan.dates.filter((d) => d.warnings.length).length - 4}{" "}
                    more to confirm
                  </li>
                ) : null}
              </ul>
            ) : null}
            {plan.skipped.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                {plan.skipped.slice(0, 4).map((s) => (
                  <li key={s.date}>
                    Skips {formatDay(s.date)} — {s.reason}
                  </li>
                ))}
                {plan.skipped.length > 4 ? (
                  <li>+{plan.skipped.length - 4} more skipped</li>
                ) : null}
              </ul>
            ) : null}
          </div>
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
          {mode === "single"
            ? "Adds time for this day only; the regular weekly schedule stays as it is."
            : "Adds the same time on each chosen day; the regular weekly schedule stays as it is."}{" "}
          Bookable right away on the web, WhatsApp and at the desk. No patient
          is messaged.
        </p>

        {confirming ? (
          <div
            role="alertdialog"
            aria-label="Confirm conflict"
            className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50"
          >
            <p className="font-bold">⚠ {confirming.message}</p>
            {confirming.details.length ? (
              <ul className="space-y-0.5 text-xs opacity-90">
                {confirming.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-xl border border-amber-400 px-3 py-1.5 text-sm font-semibold dark:border-amber-600"
              >
                Go back
              </button>
              <button
                ref={confirmRef}
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create anyway"}
              </button>
            </div>
          </div>
        ) : null}

        <div className={`flex justify-end gap-2 ${confirming ? "hidden" : ""}`}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
