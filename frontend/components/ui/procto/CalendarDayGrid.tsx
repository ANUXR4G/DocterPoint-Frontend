"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { DayWindows, TimeWindow } from "@/lib/services/procto"
import { practiceMinutesOfDay } from "@/lib/practiceTime"
import {
  drName,
  freeGapAt,
  hm12,
  occupiedWindows,
  snapMinutes,
  toMin,
  windowLabel,
} from "@/lib/quickSlots"
import type { QuickSlotRequest } from "@/components/ui/procto/QuickSlotPopover"

const PX_PER_MIN = 1.6
const MIN_CARD_PX = 26

export type GridBooking = {
  id: string
  providerId: string
  start: Date
  end?: Date | null
}

type Column = { id: string; name: string }

type Selection = { providerId: string; start: number; end: number } | null

type Drag = {
  providerId: string
  pointerId: number
  originY: number
  anchor: number
  gap: { from: number; to: number }
  interval: number
  snap: number
  moved: boolean
  sel: { providerId: string; start: number; end: number } | null
}

function hourLabel(h: number) {
  return `${h % 12 || 12} ${h < 12 || h === 24 ? "AM" : "PM"}`
}

/** Side-by-side lanes for visits that overlap in time. */
function layoutLanes<T extends { s: number; e: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e)
  const out: Array<T & { lane: number; lanes: number }> = []
  let cluster: Array<T & { lane: number; lanes: number }> = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1))
    for (const c of cluster) out.push({ ...c, lanes })
    cluster = []
  }
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush()
    const used = new Set(cluster.filter((c) => c.e > it.s).map((c) => c.lane))
    let lane = 0
    while (used.has(lane)) lane++
    cluster.push({ ...it, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  if (cluster.length) flush()
  return out
}

export default function CalendarDayGrid({
  dateIso,
  isToday,
  isPast,
  columns,
  bookings,
  windows,
  canCreate,
  selection,
  onQuickCreate,
  onRemoveExtra,
  renderBooking,
  footer,
}: {
  dateIso: string
  isToday: boolean
  isPast: boolean
  columns: Column[]
  bookings: GridBooking[]
  windows: Record<string, DayWindows | undefined>
  canCreate: (providerId: string) => boolean
  selection: Selection
  onQuickCreate: (req: QuickSlotRequest) => void
  onRemoveExtra: (
    providerId: string,
    extra: TimeWindow & { id: string },
    scope: "one" | "series",
  ) => void
  renderBooking: (bookingId: string) => ReactNode
  footer?: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  /** Repeat window whose ✕ asks "this day or all upcoming". */
  const [removing, setRemoving] = useState<string | null>(null)
  const [nowMin, setNowMin] = useState(() => practiceMinutesOfDay(new Date()))
  const [hover, setHover] = useState<{
    providerId: string
    start: number
    end: number
  } | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragSel, setDragSel] = useState<Selection>(null)

  useEffect(() => {
    if (!isToday) return
    const t = setInterval(
      () => setNowMin(practiceMinutesOfDay(new Date())),
      60_000,
    )
    return () => clearInterval(t)
  }, [isToday])

  const { startHour, endHour } = useMemo(() => {
    let lo = 7 * 60
    let hi = 22 * 60
    for (const w of Object.values(windows)) {
      for (const x of [
        ...(w?.hours ?? []),
        ...(w?.extra ?? []),
        ...(w?.blocked ?? []),
      ]) {
        lo = Math.min(lo, toMin(x.start))
        hi = Math.max(hi, toMin(x.end))
      }
    }
    for (const b of bookings) {
      const s = practiceMinutesOfDay(b.start)
      lo = Math.min(lo, s)
      hi = Math.max(hi, s + 30)
    }
    return {
      startHour: Math.floor(lo / 60),
      endHour: Math.min(24, Math.ceil(hi / 60)),
    }
  }, [windows, bookings])

  const gridStart = startHour * 60
  const gridEnd = endHour * 60
  const height = (gridEnd - gridStart) * PX_PER_MIN
  const y = (min: number) => (min - gridStart) * PX_PER_MIN

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const firsts = [
      ...Object.values(windows).flatMap((w) =>
        [...(w?.hours ?? []), ...(w?.extra ?? [])].map((x) => toMin(x.start)),
      ),
      ...bookings.map((b) => practiceMinutesOfDay(b.start)),
    ].filter((n) => !Number.isNaN(n))
    const target = firsts.length ? Math.min(...firsts) : 8 * 60
    el.scrollTop = Math.max(0, y(target - 30))
    // Scroll once per day / column set, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso, columns.map((c) => c.id).join(",")])

  const byProvider = useMemo(() => {
    const map = new Map<string, GridBooking[]>()
    for (const b of bookings) {
      const list = map.get(b.providerId) ?? []
      list.push(b)
      map.set(b.providerId, list)
    }
    return map
  }, [bookings])

  function bounds() {
    const lo = isToday
      ? Math.max(gridStart, (Math.floor(nowMin / 5) + 1) * 5)
      : gridStart
    return { lo, hi: gridEnd }
  }

  function creatable(providerId: string) {
    const w = windows[providerId]
    return (
      !isPast &&
      canCreate(providerId) &&
      !!w &&
      w.mode !== "TOKEN_BASED" &&
      !w.dayOff
    )
  }

  function minAt(el: HTMLElement, clientY: number) {
    const r = el.getBoundingClientRect()
    return gridStart + (clientY - r.top) / PX_PER_MIN
  }

  function gapFor(providerId: string, min: number) {
    const { lo, hi } = bounds()
    return freeGapAt(min, occupiedWindows(windows[providerId]), lo, hi)
  }

  function openFor(
    el: HTMLElement,
    providerId: string,
    start: number,
    end: number,
  ) {
    const r = el.getBoundingClientRect()
    onQuickCreate({
      providerId,
      date: dateIso,
      start,
      end,
      anchor: {
        left: r.left,
        top: r.top + y(start),
        width: r.width,
        height: (end - start) * PX_PER_MIN,
      },
    })
  }

  function endDrag() {
    dragRef.current = null
    setDragging(false)
    setDragSel(null)
  }

  function onPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    providerId: string,
  ) {
    if (e.button !== 0 || !creatable(providerId)) return
    if ((e.target as HTMLElement).closest("[data-cal-item]")) return
    const w = windows[providerId]!
    const min = minAt(e.currentTarget, e.clientY)
    const gap = gapFor(providerId, min)
    if (!gap) return
    const snap = snapMinutes(w.slotIntervalMin)
    const anchor = Math.max(gap.from, Math.floor(min / snap) * snap)
    if (e.pointerType === "mouse") {
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Pointer already released; the drag still ends on pointerup / leave.
      }
    }
    setHover(null)
    dragRef.current = {
      providerId,
      pointerId: e.pointerId,
      originY: e.clientY,
      anchor,
      gap,
      interval: w.slotIntervalMin,
      snap,
      moved: false,
      sel: null,
    }
    setDragging(true)
  }

  function onPointerMove(
    e: React.PointerEvent<HTMLDivElement>,
    providerId: string,
  ) {
    const min = minAt(e.currentTarget, e.clientY)
    const drag = dragRef.current
    if (drag && drag.pointerId === e.pointerId) {
      if (e.pointerType !== "mouse") return
      if (!drag.moved && Math.abs(e.clientY - drag.originY) <= 5) return
      const { anchor, gap, snap } = drag
      const start = Math.max(
        gap.from,
        Math.min(anchor, Math.floor(min / snap) * snap),
      )
      const end = Math.min(
        gap.to,
        Math.max(anchor + snap, Math.ceil(min / snap) * snap),
      )
      drag.moved = true
      drag.sel = { providerId, start, end }
      setDragSel(drag.sel)
      return
    }
    if (
      e.pointerType !== "mouse" ||
      !creatable(providerId) ||
      (e.target as HTMLElement).closest("[data-cal-item]")
    ) {
      if (hover) setHover(null)
      return
    }
    const gap = gapFor(providerId, min)
    if (!gap) {
      if (hover) setHover(null)
      return
    }
    const w = windows[providerId]!
    const snap = snapMinutes(w.slotIntervalMin)
    const s = Math.max(gap.from, Math.floor(min / snap) * snap)
    const end = Math.min(gap.to, s + w.slotIntervalMin)
    if (
      !hover ||
      hover.providerId !== providerId ||
      hover.start !== s ||
      hover.end !== end
    ) {
      setHover({ providerId, start: s, end })
    }
  }

  function onPointerUp(
    e: React.PointerEvent<HTMLDivElement>,
    providerId: string,
  ) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    endDrag()
    if (drag.moved && drag.sel) {
      openFor(el, providerId, drag.sel.start, drag.sel.end)
    } else {
      openFor(
        el,
        providerId,
        drag.anchor,
        Math.min(drag.gap.to, drag.anchor + drag.interval),
      )
    }
  }

  const hours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  )
  const colMinW = 220

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div style={{ minWidth: 64 + columns.length * colMinW }}>
          <div className="sticky top-0 z-30 flex border-b border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="sticky left-0 z-10 w-16 shrink-0 bg-white dark:bg-neutral-900" />
            {columns.map((c) => {
              const w = windows[c.id]
              const can = creatable(c.id)
              const summary = !w
                ? "Loading…"
                : w.dayOff
                  ? "On leave"
                  : w.mode === "TOKEN_BASED"
                    ? "Token queue"
                    : w.hours.length
                      ? `${w.hours.map(windowLabel).join(", ")} · ${w.slotIntervalMin}-min slots`
                      : "No regular hours"
              return (
                <div
                  key={c.id}
                  className="group relative flex min-w-[220px] flex-1 items-center justify-between gap-2 border-l border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                      {drName(c.name)}
                    </p>
                    <p className="truncate text-xs opacity-60">{summary}</p>
                  </div>
                  {can ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        onQuickCreate({
                          providerId: c.id,
                          date: dateIso,
                          anchor: {
                            left: r.left,
                            top: r.bottom,
                            width: r.width,
                            height: 0,
                          },
                        })
                      }}
                      className="shrink-0 rounded-lg border border-[var(--theme-primary)]/40 px-2 py-1 text-xs font-bold text-[var(--theme-primary)] opacity-0 transition hover:bg-[var(--theme-primary)]/10 focus:opacity-100 group-hover:opacity-100"
                    >
                      + Slot
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="flex">
            <div
              className="sticky left-0 z-20 w-16 shrink-0 bg-white dark:bg-neutral-900"
              style={{ height }}
            >
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums opacity-50"
                  style={{ top: y(h * 60) }}
                >
                  {h === startHour ? "" : hourLabel(h)}
                </span>
              ))}
            </div>

            {columns.map((c) => {
              const w = windows[c.id]
              const can = creatable(c.id)
              const colBookings = layoutLanes(
                (byProvider.get(c.id) ?? []).map((b) => {
                  const s = practiceMinutesOfDay(b.start)
                  const dur = b.end
                    ? (b.end.getTime() - b.start.getTime()) / 60_000
                    : (w?.slotIntervalMin ?? 15)
                  return { b, s, e: s + Math.max(5, dur) }
                }),
              )
              const sel =
                dragSel?.providerId === c.id
                  ? dragSel
                  : selection?.providerId === c.id
                    ? selection
                    : null
              const ghost =
                !dragging && !sel && hover?.providerId === c.id ? hover : null
              return (
                <div
                  key={c.id}
                  className={`relative min-w-[220px] flex-1 select-none border-l border-neutral-200 dark:border-neutral-700 ${
                    can ? "cursor-crosshair" : ""
                  }`}
                  style={{
                    height,
                    touchAction: "pan-y",
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(120,120,120,0.07) 0 6px, transparent 6px 12px)",
                  }}
                  onPointerDown={(e) => onPointerDown(e, c.id)}
                  onPointerMove={(e) => onPointerMove(e, c.id)}
                  onPointerUp={(e) => onPointerUp(e, c.id)}
                  onPointerCancel={endDrag}
                  onPointerLeave={() => setHover(null)}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-neutral-100 dark:border-neutral-800"
                      style={{ top: y(h * 60) }}
                    />
                  ))}

                  {w?.hours.map((hw) => (
                    <div
                      key={`h-${hw.start}`}
                      className="pointer-events-none absolute inset-x-0 border-y border-sky-100 bg-white dark:border-sky-900/40 dark:bg-neutral-900"
                      style={{
                        top: y(toMin(hw.start)),
                        height: (toMin(hw.end) - toMin(hw.start)) * PX_PER_MIN,
                        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${w.slotIntervalMin * PX_PER_MIN - 1}px, rgba(14,165,233,0.12) ${w.slotIntervalMin * PX_PER_MIN - 1}px ${w.slotIntervalMin * PX_PER_MIN}px)`,
                      }}
                    />
                  ))}

                  {w?.blocked.map((bw) => (
                    <div
                      key={`b-${bw.start}`}
                      className="pointer-events-none absolute inset-x-1 rounded-md border border-red-200 bg-red-50/80 px-2 py-1 text-[11px] font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                      style={{
                        top: y(toMin(bw.start)),
                        height: (toMin(bw.end) - toMin(bw.start)) * PX_PER_MIN,
                      }}
                    >
                      Blocked {windowLabel(bw)}
                    </div>
                  ))}

                  {w?.extra.map((xw) => (
                    <div
                      key={`x-${xw.id}`}
                      data-cal-item
                      className="group/extra absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-violet-400 bg-violet-50/90 px-2 py-1 text-[11px] text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                      style={{
                        top: y(toMin(xw.start)),
                        height: (toMin(xw.end) - toMin(xw.start)) * PX_PER_MIN,
                      }}
                      title={[
                        xw.seriesId ? "Repeating extra slots" : "Extra slots",
                        `${xw.slotIntervalMin}-min slots`,
                        xw.capacity > 1
                          ? `up to ${xw.capacity} patients each`
                          : "",
                        xw.note ?? "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="truncate font-bold">
                          {xw.seriesId ? (
                            <span aria-label="Repeats">↻ </span>
                          ) : null}
                          Extra · {windowLabel(xw)}
                          <span className="font-normal opacity-80">
                            {" "}
                            · {xw.slotIntervalMin} min
                            {xw.capacity > 1 ? ` · ×${xw.capacity}` : ""}
                            {xw.note ? ` · ${xw.note}` : ""}
                          </span>
                        </span>
                        {canCreate(c.id) && !isPast ? (
                          <button
                            type="button"
                            onClick={() =>
                              xw.seriesId
                                ? setRemoving((r) =>
                                    r === xw.id ? null : xw.id,
                                  )
                                : onRemoveExtra(c.id, xw, "one")
                            }
                            aria-label={`Remove extra slots ${windowLabel(xw)}`}
                            title="Remove these extra slots"
                            className={`shrink-0 rounded px-1 font-bold transition hover:bg-violet-200 focus:opacity-100 group-hover/extra:opacity-100 dark:hover:bg-violet-800 ${
                              removing === xw.id ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                      {removing === xw.id ? (
                        <div
                          role="group"
                          aria-label="Remove repeating slots"
                          className="mt-1 flex flex-wrap items-center gap-1"
                        >
                          <span className="font-semibold">Remove:</span>
                          {(
                            [
                              ["one", "This day"],
                              ["series", "All upcoming"],
                            ] as const
                          ).map(([scope, label]) => (
                            <button
                              key={scope}
                              type="button"
                              onClick={() => {
                                setRemoving(null)
                                onRemoveExtra(c.id, xw, scope)
                              }}
                              className="rounded border border-violet-400 bg-white px-1.5 py-0.5 font-semibold hover:bg-violet-100 dark:bg-violet-950 dark:hover:bg-violet-900"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {w?.dayOff ? (
                    <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-red-50/60 pt-6 text-sm font-semibold text-red-800 dark:bg-red-950/30 dark:text-red-200">
                      On leave{w.dayOff.reason ? ` — ${w.dayOff.reason}` : ""}
                    </div>
                  ) : null}

                  {isPast || (isToday && nowMin > gridStart) ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 bg-neutral-500/10 dark:bg-black/30"
                      style={{
                        height: isPast ? height : Math.min(height, y(nowMin)),
                      }}
                    />
                  ) : null}
                  {isToday && nowMin >= gridStart && nowMin <= gridEnd ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                      style={{ top: y(nowMin) }}
                    />
                  ) : null}

                  {ghost ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-10 flex items-center justify-center rounded-md border border-dashed border-[var(--theme-primary)] bg-[var(--theme-primary)]/5 text-xs font-bold text-[var(--theme-primary)]"
                      style={{
                        top: y(ghost.start),
                        height: Math.max(
                          18,
                          (ghost.end - ghost.start) * PX_PER_MIN,
                        ),
                      }}
                    >
                      + Slot {hm12(ghost.start)}
                    </div>
                  ) : null}

                  {sel ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-[var(--theme-primary)] bg-[var(--theme-primary)]/15 px-2 py-1 text-xs font-bold text-[var(--theme-primary)]"
                      style={{
                        top: y(sel.start),
                        height: Math.max(
                          18,
                          (sel.end - sel.start) * PX_PER_MIN,
                        ),
                      }}
                    >
                      {hm12(sel.start)}–{hm12(sel.end)}
                    </div>
                  ) : null}

                  {colBookings.map(({ b, s, e, lane, lanes }) => (
                    <div
                      key={b.id}
                      data-cal-item
                      className="absolute z-10 px-0.5"
                      style={{
                        top: y(s),
                        height: Math.max(MIN_CARD_PX, (e - s) * PX_PER_MIN),
                        left: `${(lane / lanes) * 100}%`,
                        width: `${100 / lanes}%`,
                      }}
                    >
                      {renderBooking(b.id)}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        {footer}
      </div>
    </div>
  )
}
