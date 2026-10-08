"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { DayWindows, TimeWindow } from "@/lib/services/procto"
import { practiceMinutesOfDay } from "@/lib/practiceTime"
import {
  bookableGapAt,
  drName,
  freeGapAt,
  hm12,
  occupiedWindows,
  addedByLine,
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
  onBookSlot,
  onMoveBooking,
  canDragBooking,
  onRemoveExtra,
  freshIds,
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
  /** Left-click / drag empty gap → desk book. Right-click → onQuickCreate. */
  onBookSlot?: (req: QuickSlotRequest) => void
  /** Drop an appointment card on another time or doctor column (same day). */
  onMoveBooking?: (move: {
    bookingId: string
    providerId: string
    start: number
    date: string
  }) => void
  /** Upcoming timed visits only. Omitted → every card can be dragged when onMoveBooking is set. */
  canDragBooking?: (bookingId: string) => boolean
  onRemoveExtra: (
    providerId: string,
    extra: TimeWindow & { id: string },
    scope: "one" | "series",
  ) => void
  /** Just-created extra windows: highlighted and scrolled into view. */
  freshIds?: string[]
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
  const lastPick = useRef<{ providerId: string; start: number; end: number } | null>(
    null,
  )
  const [shiftSel, setShiftSel] = useState<Selection>(null)
  const cardDrag = useRef<{
    bookingId: string
    providerId: string
    startMin: number
    pointerId: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const [cardGhost, setCardGhost] = useState<{ x: number; y: number } | null>(null)

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

  const freshKey = (freshIds ?? []).join(",")
  useEffect(() => {
    if (!freshKey) return
    const t = window.setTimeout(() => {
      scroller.current
        ?.querySelector("[data-fresh]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 150)
    return () => window.clearTimeout(t)
  }, [freshKey, windows])

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
    return !isPast && canCreate(providerId) && !!w && w.mode !== "TOKEN_BASED"
  }

  /** Empty gaps that can take a desk booking (no MANAGE_SLOTS required). */
  function bookable(providerId: string) {
    const w = windows[providerId]
    return !isPast && !!w && !w.dayOff && w.mode !== "TOKEN_BASED"
  }

  function minAt(el: HTMLElement, clientY: number) {
    const r = el.getBoundingClientRect()
    return gridStart + (clientY - r.top) / PX_PER_MIN
  }

  function visitRanges(providerId: string): Array<[number, number]> {
    const w = windows[providerId]
    const interval = w?.slotIntervalMin ?? 15
    return (byProvider.get(providerId) ?? []).map((b) => {
      const s = practiceMinutesOfDay(b.start)
      const dur = b.end
        ? (b.end.getTime() - b.start.getTime()) / 60_000
        : interval
      return [s, s + Math.max(5, dur)] as [number, number]
    })
  }

  /** Gaps outside the schedule — for adding / extending slots. */
  function extendGapFor(providerId: string, min: number) {
    const { lo, hi } = bounds()
    return freeGapAt(min, occupiedWindows(windows[providerId]), lo, hi)
  }

  /** Empty time inside hours/extra — for desk booking a patient. */
  function bookGapFor(providerId: string, min: number) {
    const { lo, hi } = bounds()
    return bookableGapAt(
      min,
      windows[providerId],
      visitRanges(providerId),
      lo,
      hi,
    )
  }

  function slotRequest(
    el: HTMLElement,
    providerId: string,
    start: number,
    end: number,
  ): QuickSlotRequest {
    const r = el.getBoundingClientRect()
    return {
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
    }
  }

  function openExtend(
    el: HTMLElement,
    providerId: string,
    start: number,
    end: number,
  ) {
    onQuickCreate(slotRequest(el, providerId, start, end))
  }

  function openBook(
    el: HTMLElement,
    providerId: string,
    start: number,
    end: number,
  ) {
    const req = slotRequest(el, providerId, start, end)
    if (onBookSlot) onBookSlot(req)
    else onQuickCreate(req)
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
    // Left-click books inside schedule gaps only (extend is right-click).
    if (e.button !== 0 || !bookable(providerId) || !onBookSlot) return
    if ((e.target as HTMLElement).closest("[data-cal-item]")) return
    const w = windows[providerId]!
    const min = minAt(e.currentTarget, e.clientY)
    const gap = bookGapFor(providerId, min)
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
      !bookable(providerId) ||
      !onBookSlot ||
      (e.target as HTMLElement).closest("[data-cal-item]")
    ) {
      if (hover) setHover(null)
      return
    }
    const gap = bookGapFor(providerId, min)
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
    let start =
      drag.moved && drag.sel ? drag.sel.start : drag.anchor
    let end =
      drag.moved && drag.sel
        ? drag.sel.end
        : Math.min(drag.gap.to, drag.anchor + drag.interval)
    const prev = lastPick.current
    if (e.shiftKey && !drag.moved) {
      if (
        prev?.providerId === providerId &&
        prev.start >= drag.gap.from &&
        prev.end <= drag.gap.to
      ) {
        start = Math.min(prev.start, start)
        end = Math.max(prev.end, end)
        lastPick.current = { providerId, start, end }
        setShiftSel(null)
        if (onBookSlot) openBook(el, providerId, start, end)
        return
      }
      lastPick.current = { providerId, start, end }
      setShiftSel({ providerId, start, end })
      return
    }
    lastPick.current = { providerId, start, end }
    setShiftSel(null)
    // Left-click / drag → book patient; extend schedule is right-click / + Slot.
    if (onBookSlot) openBook(el, providerId, start, end)
  }

  function columnAt(x: number, y: number) {
    const hit = document
      .elementsFromPoint(x, y)
      .map((node) => (node as HTMLElement).closest?.("[data-cal-col]"))
      .find(Boolean) as HTMLElement | undefined
    if (!hit?.dataset.calCol) return null
    return { providerId: hit.dataset.calCol, el: hit }
  }

  function snapDrop(providerId: string, el: HTMLElement, clientY: number) {
    const w = windows[providerId]
    if (!w || w.dayOff || w.mode === "TOKEN_BASED") return null
    const min = minAt(el, clientY)
    const schedule = [...w.hours, ...w.extra]
      .map((win) => [toMin(win.start), toMin(win.end)] as [number, number])
      .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e))
    const win = schedule.find(([s, e]) => min >= s && min < e)
    if (!win) return null
    const snap = snapMinutes(w.slotIntervalMin)
    const latest = win[1] - w.slotIntervalMin
    if (latest < win[0]) return null
    const start = Math.max(win[0], Math.min(Math.floor(min / snap) * snap, latest))
    if (isPast) return null
    if (isToday && start <= nowMin) return null
    return start
  }

  function beginCardDrag(
    e: React.PointerEvent<HTMLDivElement>,
    booking: GridBooking,
    startMin: number,
  ) {
    if (!onMoveBooking || e.button !== 0) return
    if (canDragBooking && !canDragBooking(booking.id)) return
    if ((e.target as HTMLElement).closest("[data-cal-menu]")) return
    cardDrag.current = {
      bookingId: booking.id,
      providerId: booking.providerId,
      startMin,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already released.
    }
  }

  function moveCardDrag(e: React.PointerEvent<HTMLDivElement>, bookingId: string) {
    const drag = cardDrag.current
    if (!drag || drag.bookingId !== bookingId || drag.pointerId !== e.pointerId) return
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.originX, e.clientY - drag.originY) < 6
    ) {
      return
    }
    drag.moved = true
    setCardGhost({ x: e.clientX, y: e.clientY })
  }

  function endCardDrag(e: React.PointerEvent<HTMLDivElement>, bookingId: string) {
    const drag = cardDrag.current
    if (!drag || drag.bookingId !== bookingId || drag.pointerId !== e.pointerId) return
    cardDrag.current = null
    setCardGhost(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (!drag.moved || !onMoveBooking) return
    suppressClick.current = true
    const hit = columnAt(e.clientX, e.clientY)
    if (!hit) return
    const start = snapDrop(hit.providerId, hit.el, e.clientY)
    if (start == null) return
    if (hit.providerId === drag.providerId && start === drag.startMin) return
    onMoveBooking({
      bookingId,
      providerId: hit.providerId,
      start,
      date: dateIso,
    })
  }

  function onContextMenu(
    e: React.MouseEvent<HTMLDivElement>,
    providerId: string,
  ) {
    if (!creatable(providerId)) return
    if ((e.target as HTMLElement).closest("[data-cal-item]")) return
    e.preventDefault()
    const el = e.currentTarget
    const min = minAt(el, e.clientY)
    const gap = extendGapFor(providerId, min)
    if (!gap) return
    const w = windows[providerId]!
    const snap = snapMinutes(w.slotIntervalMin)
    const start = Math.max(gap.from, Math.floor(min / snap) * snap)
    const end = Math.min(gap.to, start + w.slotIntervalMin)
    openExtend(el, providerId, start, end)
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
              const canBook = bookable(c.id)
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
                  : shiftSel?.providerId === c.id
                    ? shiftSel
                    : selection?.providerId === c.id
                      ? selection
                      : null
              const ghost =
                !dragging && !sel && hover?.providerId === c.id ? hover : null
              return (
                <div
                  key={c.id}
                  data-cal-col={c.id}
                  className={`relative min-w-[220px] flex-1 select-none border-l border-neutral-200 dark:border-neutral-700 ${
                    canBook && onBookSlot ? "cursor-pointer" : can ? "cursor-crosshair" : ""
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
                  onContextMenu={(e) => onContextMenu(e, c.id)}
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

                  {w?.breaks?.map((br) => (
                    <div
                      key={`br-${br.start}`}
                      className="pointer-events-none absolute inset-x-1 rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                      style={{
                        top: y(toMin(br.start)),
                        height: (toMin(br.end) - toMin(br.start)) * PX_PER_MIN,
                      }}
                    >
                      Break {windowLabel(br)}
                    </div>
                  ))}

                  {w?.dayOff ? (
                    <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-red-50/60 pt-6 text-sm font-semibold text-red-800 dark:bg-red-950/30 dark:text-red-200">
                      On leave{w.dayOff.reason ? ` — ${w.dayOff.reason}` : ""}
                    </div>
                  ) : null}

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
                      data-fresh={freshIds?.includes(xw.id) ? "" : undefined}
                      className={`group/extra absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-violet-400 bg-violet-50/90 px-2 py-1 text-[11px] text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100 ${
                        freshIds?.includes(xw.id)
                          ? "z-10 animate-pulse ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-neutral-900"
                          : ""
                      }`}
                      style={{
                        top: y(toMin(xw.start)),
                        height: (toMin(xw.end) - toMin(xw.start)) * PX_PER_MIN,
                      }}
                      title={[
                        xw.seriesId
                          ? "Manual repeating slots"
                          : "Manual slot (not in the weekly schedule)",
                        addedByLine(xw),
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
                          <span className="mr-1 inline-block rounded bg-violet-600 px-1 py-px align-[1px] text-[9px] font-bold uppercase tracking-wide text-white dark:bg-violet-500">
                            Manual
                          </span>
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
                      Book {hm12(ghost.start)}
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
                      className={`absolute z-10 px-0.5 ${
                        onMoveBooking && (!canDragBooking || canDragBooking(b.id))
                          ? "cursor-grab active:cursor-grabbing"
                          : ""
                      }`}
                      style={{
                        top: y(s),
                        height: Math.max(MIN_CARD_PX, (e - s) * PX_PER_MIN),
                        left: `${(lane / lanes) * 100}%`,
                        width: `${100 / lanes}%`,
                      }}
                      onPointerDown={(ev) => beginCardDrag(ev, b, s)}
                      onPointerMove={(ev) => moveCardDrag(ev, b.id)}
                      onPointerUp={(ev) => endCardDrag(ev, b.id)}
                      onClickCapture={(ev) => {
                        if (!suppressClick.current) return
                        suppressClick.current = false
                        ev.preventDefault()
                        ev.stopPropagation()
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
      {cardGhost
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--theme-primary)] bg-white px-2 py-1 text-xs font-bold text-[var(--theme-primary)] shadow-lg dark:bg-neutral-900"
              style={{ left: cardGhost.x, top: cardGhost.y }}
            >
              Move appointment
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
