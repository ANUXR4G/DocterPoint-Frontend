"use client"

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subMonths,
} from "date-fns"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  filterBookingsByRange,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"
import {
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"

type ViewMode = "day" | "week" | "month"

type Membership = {
  userId: string
  role: string
  practice: {
    id: string
    name: string
    members?: Array<{
      userId: string
      role: string
      isActive?: boolean
      user: {
        id: string
        name: string | null
        email?: string | null
        doctor?: { licenseNo?: string | null } | null
      }
    }>
  }
}

type CalBooking = ProctoBooking & {
  patientName?: string | null
  patient_name?: string | null
  patientPhone?: string | null
  patient_phone?: string | null
  slotStart?: string | null
  slot_start?: string | null
  sessionDate?: string | null
  session_date?: string | null
  tokenNumber?: number | null
  token_number?: number | null
  disease?: string | null
  provider?: { id: string; name: string | null } | null
  providerId?: string | null
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 08:00–20:00

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function bookingStart(b: CalBooking): Date | null {
  const slot = b.slotStart ?? b.slot_start
  if (slot) return new Date(slot)
  const session = b.sessionDate ?? b.session_date
  if (session) {
    const d = new Date(session)
    d.setHours(9, 0, 0, 0)
    return d
  }
  return null
}

function bookingDayKey(b: CalBooking): string | null {
  const start = bookingStart(b)
  return start ? ymd(start) : null
}

function timeLabel(b: CalBooking) {
  const slot = b.slotStart ?? b.slot_start
  if (slot) {
    return new Date(slot).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  const token = b.tokenNumber ?? b.token_number
  if (token != null) return `#${token}`
  return "—"
}

function patientLabel(b: CalBooking) {
  return (
    b.patientName ||
    b.patient_name ||
    b.patientPhone ||
    b.patient_phone ||
    "Patient"
  )
}

function statusClass(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700"
    case "COMPLETED":
      return "bg-green-100 text-green-900 border-green-300 dark:bg-green-900/40 dark:text-green-100 dark:border-green-700"
    case "CANCELED":
      return "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-100 dark:border-red-700"
    case "NO_SHOW":
      return "bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:border-neutral-600"
    default:
      return "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-700"
  }
}

function phoneOf(b: CalBooking) {
  return b.patientPhone || b.patient_phone || "—"
}

function dateLabel(b: CalBooking) {
  const start = bookingStart(b)
  if (!start) return "—"
  return start.toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function BookingHoverDetails({ booking }: { booking: CalBooking }) {
  return (
    <div className="w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900 sm:w-96">
      <p className="text-base font-bold text-neutral-900 dark:text-white">
        {patientLabel(booking)}
      </p>
      <dl className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">When</dt>
          <dd className="text-right font-semibold">{dateLabel(booking)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Time / token</dt>
          <dd className="font-semibold">{timeLabel(booking)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Phone</dt>
          <dd className="font-semibold">{phoneOf(booking)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Doctor</dt>
          <dd className="text-right font-semibold">
            {booking.provider?.name ? `Dr ${booking.provider.name}` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Disease</dt>
          <dd className="text-right font-semibold">
            {booking.disease ||
              booking.consultationType ||
              booking.consultation_type ||
              "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Mode</dt>
          <dd className="font-semibold">
            {(booking.mode || "").replace(/_/g, " ") || "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="opacity-60">Status</dt>
          <dd>
            <span
              className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${statusClass(booking.status)}`}
            >
              {booking.status.replace(/_/g, " ")}
            </span>
          </dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-neutral-100 pt-3 text-xs font-bold text-[var(--theme-primary)] dark:border-neutral-700">
        Click to open visit
      </p>
    </div>
  )
}

function BookingCard({
  booking,
  compact = false,
}: {
  booking: CalBooking
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelW = 384
    const panelH = 280
    let left = r.left
    let top = r.bottom + 8
    if (left + panelW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelW - 12)
    }
    if (top + panelH > window.innerHeight - 12) {
      top = Math.max(12, r.top - panelH - 8)
    }
    setPos({ top, left })
    setOpen(true)
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
    >
      <Link
        href={`/doctor/queue/${booking.id}`}
        onClick={(e) => e.stopPropagation()}
        className={`block rounded-lg border text-left transition hover:brightness-[0.98] dark:hover:brightness-110 ${statusClass(booking.status)} ${
          compact ? "px-1.5 py-1" : "px-2.5 py-2"
        }`}
      >
        {compact ? (
          <p className="truncate text-[11px] font-semibold leading-tight">
            {timeLabel(booking)} {patientLabel(booking)}
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold leading-tight">
              {timeLabel(booking)} · {patientLabel(booking)}
            </p>
            <p className="mt-0.5 truncate text-xs opacity-80">
              {booking.provider?.name
                ? `Dr ${booking.provider.name}`
                : booking.disease || booking.mode.replace(/_/g, " ")}
            </p>
          </>
        )}
      </Link>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999]"
              style={{ top: pos.top, left: pos.left }}
            >
              <BookingHoverDetails booking={booking} />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default function AppointmentCalendar() {
  const {
    memberships,
    bookings: sharedBookings,
    ready,
    loading: shellLoading,
    error: shellError,
  } = usePracticeDashboard()
  const [error, setError] = useState("")
  const [practiceId, setPracticeId] = useState("")
  const [practiceName, setPracticeName] = useState("")
  const [doctors, setDoctors] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [providerId, setProviderId] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [view, setView] = useState<ViewMode>("week")
  const [anchor, setAnchor] = useState(() => startOfToday())
  const loading = !ready && shellLoading
  const [timeSlots, setTimeSlots] = useState<
    Array<{
      start: string
      end: string
      booked: number
      capacity: number
      available: boolean
    }>
  >([])

  const range = useMemo(() => {
    if (view === "day") {
      return { from: ymd(anchor), to: ymd(anchor) }
    }
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      const end = endOfWeek(anchor, { weekStartsOn: 1 })
      return { from: ymd(start), to: ymd(end) }
    }
    const start = startOfMonth(anchor)
    const end = endOfMonth(anchor)
    return { from: ymd(start), to: ymd(end) }
  }, [anchor, view])

  const weekDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      }),
    [anchor],
  )

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [anchor])

  useEffect(() => {
    if (!ready) return
    setError(shellError || "")
    if (!memberships.length) {
      setPracticeId("")
      setDoctors([])
      return
    }

    const membership = memberships[0] as unknown as Membership
    const practice = membership?.practice
    if (!practice?.id) return

    setPracticeId(practice.id)
    setPracticeName(practice.name)

    const roster = (practice.members ?? [])
      .filter(
        (m) =>
          m.isActive !== false &&
          (m.role === "DOCTOR" ||
            m.role === "PRACTICE_OWNER" ||
            m.user?.doctor),
      )
      .map((m) => ({
        id: m.userId || m.user.id,
        name: m.user?.name || m.user?.email || "Doctor",
      }))

    const unique = Array.from(
      new Map(roster.map((d) => [d.id, d])).values(),
    )
    setDoctors(unique)
  }, [ready, memberships, shellError])

  const bookings = useMemo(() => {
    if (!practiceId) return [] as CalBooking[]
    let list = filterBookingsByRange(
      sharedBookings,
      range.from,
      range.to,
    ) as CalBooking[]
    if (providerId !== "all") {
      list = list.filter((b) => {
        const pid = b.providerId ?? b.provider?.id
        return pid === providerId
      })
    }
    if (statusFilter !== "all") {
      list = list.filter((b) =>
        matchesQueueStatusFilter(b.status, statusFilter),
      )
    }
    return list
  }, [
    practiceId,
    sharedBookings,
    range.from,
    range.to,
    providerId,
    statusFilter,
  ])

  const loadDaySlots = useCallback(async () => {
    if (!practiceId || view !== "day" || providerId === "all") {
      setTimeSlots([])
      return
    }
    const res = await proctoService.getCalendar(
      practiceId,
      providerId,
      ymd(anchor),
    )
    if (res.status === "successful" && res.data?.timeSlots) {
      setTimeSlots(res.data.timeSlots)
    } else {
      setTimeSlots([])
    }
  }, [practiceId, view, providerId, anchor])

  useEffect(() => {
    void loadDaySlots()
  }, [loadDaySlots])

  const visibleBookings = useMemo(
    () =>
      bookings.filter((b) =>
        matchesQueueStatusFilter(b.status || "", statusFilter),
      ),
    [bookings, statusFilter],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, CalBooking[]>()
    for (const b of visibleBookings) {
      const key = bookingDayKey(b)
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(b)
      map.set(key, list)
    }
    return map
  }, [visibleBookings])

  const dayBookings = byDay.get(ymd(anchor)) ?? []

  const title = useMemo(() => {
    if (view === "day") return format(anchor, "EEEE, d MMMM yyyy")
    if (view === "week") {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      const end = endOfWeek(anchor, { weekStartsOn: 1 })
      return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`
    }
    return format(anchor, "MMMM yyyy")
  }, [anchor, view])

  function shift(dir: -1 | 1) {
    if (view === "day") setAnchor((d) => addDays(d, dir))
    else if (view === "week") setAnchor((d) => addWeeks(d, dir))
    else setAnchor((d) => (dir > 0 ? addMonths(d, 1) : subMonths(d, 1)))
  }

  if (loading) {
    return (
      <div
        role="status"
        className="h-full min-h-0 animate-pulse rounded-2xl border border-neutral-200 bg-neutral-200/70 dark:border-neutral-700 dark:bg-neutral-800/80"
      >
        <span className="sr-only">Loading calendar…</span>
      </div>
    )
  }

  if (!practiceId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm dark:border-neutral-600">
        <div>
          <p className="font-medium opacity-80">No practice linked yet.</p>
          <Link
            href="/doctor/onboard"
            className="mt-3 inline-block font-semibold text-[var(--theme-primary)] underline"
          >
            Set up practice
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-base font-bold text-neutral-900 dark:text-white">
            {practiceName} · {visibleBookings.length} appointment
            {visibleBookings.length === 1 ? "" : "s"}
          </p>
          <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            {title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-xl border border-neutral-200 p-1 dark:border-neutral-700"
            role="group"
            aria-label="Calendar view"
          >
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  view === id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold dark:border-neutral-700"
              aria-label="Previous"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setAnchor(startOfToday())}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold dark:border-neutral-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-semibold dark:border-neutral-700"
              aria-label="Next"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold opacity-70">Doctor</span>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="form-input min-w-[12rem] rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600"
            >
              <option value="all">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {view === "day" ? (
            <input
              type="date"
              value={ymd(anchor)}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, day] = e.target.value.split("-").map(Number)
                setAnchor(new Date(y, m - 1, day))
              }}
              className="form-input rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600"
            />
          ) : null}
        </div>
        <BookingStatusFilterBar
          value={statusFilter}
          onChange={setStatusFilter}
          statuses={bookings.map((b) => b.status)}
        />
      </div>

      {error ? (
        <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        {view === "day" ? (
          <DayView
            day={anchor}
            bookings={dayBookings}
            timeSlots={timeSlots}
            showSlots={providerId !== "all"}
          />
        ) : null}

        {view === "week" ? (
          <WeekView
            days={weekDays}
            byDay={byDay}
            onSelectDay={(d) => {
              setAnchor(d)
              setView("day")
            }}
          />
        ) : null}

        {view === "month" ? (
          <MonthView
            anchor={anchor}
            days={monthDays}
            byDay={byDay}
            onSelectDay={(d) => {
              setAnchor(d)
              setView("day")
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function DayView({
  day,
  bookings,
  timeSlots,
  showSlots,
}: {
  day: Date
  bookings: CalBooking[]
  timeSlots: Array<{
    start: string
    end: string
    booked: number
    capacity: number
    available: boolean
  }>
  showSlots: boolean
}) {
  const timed = bookings.filter((b) => b.slotStart || b.slot_start)
  const tokens = bookings.filter((b) => !(b.slotStart || b.slot_start))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
      {showSlots && timeSlots.length > 0 ? (
        <div className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
            Time slots · {format(day, "d MMM")}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
            {timeSlots.map((s) => {
              const start = new Date(s.start)
              const label = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
              const filled = s.booked > 0
              return (
                <span
                  key={s.start}
                  title={`${label} · ${s.booked} of ${s.capacity} booked`}
                  className={`inline-flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums ${
                    filled
                      ? "border-green-500 bg-green-100 text-green-800 dark:border-green-500/60 dark:bg-green-900/40 dark:text-green-200"
                      : "border-neutral-300 bg-neutral-100 text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`text-xs font-bold ${
                      filled ? "opacity-90" : "opacity-70"
                    }`}
                  >
                    {s.booked}/{s.capacity}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
        {HOURS.map((hour) => {
          const hourBookings = timed.filter((b) => {
            const start = bookingStart(b)
            return start ? start.getHours() === hour : false
          })
          return (
            <div
              key={hour}
              className="grid min-h-[4.5rem] grid-cols-[4.5rem_1fr] gap-3 px-4 py-3"
            >
              <p className="pt-1 text-sm font-semibold tabular-nums opacity-60">
                {String(hour).padStart(2, "0")}:00
              </p>
              <div className="flex min-h-10 flex-col gap-2">
                {hourBookings.length ? (
                  hourBookings.map((b) => (
                    <BookingCard key={b.id} booking={b} />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-xs opacity-40 dark:border-neutral-700">
                    Open
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {tokens.length > 0 ? (
          <div className="px-4 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
              Token queue
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tokens.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          </div>
        ) : null}

        {!bookings.length ? (
          <p className="px-4 py-8 text-center text-sm opacity-60">
            No appointments on this day.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function WeekView({
  days,
  byDay,
  onSelectDay,
}: {
  days: Date[]
  byDay: Map<string, CalBooking[]>
  onSelectDay: (d: Date) => void
}) {
  const today = startOfToday()
  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-auto overflow-y-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="grid h-full min-h-0 min-w-[720px] flex-1 grid-cols-7 divide-x divide-neutral-100 dark:divide-neutral-800">
        {days.map((d) => {
          const key = ymd(d)
          const list = byDay.get(key) ?? []
          const isToday = isSameDay(d, today)
          return (
            <div key={key} className="flex h-full min-h-0 flex-col">
              <button
                type="button"
                onClick={() => onSelectDay(d)}
                className={`flex w-full shrink-0 flex-col items-start border-b border-neutral-100 px-3 py-3 text-left dark:border-neutral-800 ${
                  isToday ? "bg-[#0099ff]/10" : ""
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide opacity-50">
                  {format(d, "EEE")}
                </span>
                <span
                  className={`mt-0.5 text-lg font-semibold ${
                    isToday ? "text-[#0099ff]" : ""
                  }`}
                >
                  {format(d, "d")}
                </span>
                <span className="text-xs opacity-60">
                  {list.length} slot{list.length === 1 ? "" : "s"}
                </span>
              </button>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {list.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
                {!list.length ? (
                  <p className="px-1 py-6 text-center text-xs opacity-40">
                    —
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthView({
  anchor,
  days,
  byDay,
  onSelectDay,
}: {
  anchor: Date
  days: Date[]
  byDay: Map<string, CalBooking[]>
  onSelectDay: (d: Date) => void
}) {
  const today = startOfToday()
  const headers = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-h-0 min-w-[560px] flex-col">
          <div className="grid min-w-[560px] shrink-0 grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
            {headers.map((h) => (
              <div
                key={h}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide opacity-50"
              >
                {h}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 min-w-[560px] flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
            {days.map((d) => {
              const key = ymd(d)
              const list = byDay.get(key) ?? []
              const inMonth = isSameMonth(d, anchor)
              const isToday = isSameDay(d, today)
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDay(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelectDay(d)
                    }
                  }}
                  className={`flex min-h-[5.5rem] cursor-pointer flex-col border-b border-r border-neutral-100 p-2 text-left transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60 ${
                    !inMonth ? "opacity-40" : ""
                  } ${isToday ? "bg-[#0099ff]/5" : ""}`}
                >
                  <div className="flex shrink-0 items-center justify-between gap-1">
                    <span
                      className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? "bg-[#0099ff] text-white" : ""
                      }`}
                    >
                      {format(d, "d")}
                    </span>
                    {list.length ? (
                      <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-black">
                        {list.length}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
                    {list.slice(0, 4).map((b) => (
                      <li key={b.id}>
                        <BookingCard booking={b} compact />
                      </li>
                    ))}
                    {list.length > 4 ? (
                      <li className="text-[11px] font-semibold opacity-50">
                        +{list.length - 4} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
