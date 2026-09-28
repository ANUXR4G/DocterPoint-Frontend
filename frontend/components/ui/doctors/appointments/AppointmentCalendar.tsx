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
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { consultationTypeLabel } from "@/lib/bookingDisplay"
import {
  formatPracticeDateTime,
  formatPracticeTime,
  practiceDateIso,
  practiceTodayIso,
} from "@/lib/practiceTime"
import {
  proctoService,
  type DayWindows,
  type ProctoBooking,
  type TimeWindow,
} from "@/lib/services/procto"
import { drName, windowLabel } from "@/lib/quickSlots"
import CalendarDayGrid, {
  type GridBooking,
} from "@/components/ui/procto/CalendarDayGrid"
import QuickSlotPopover, {
  type QuickSlotRequest,
} from "@/components/ui/procto/QuickSlotPopover"
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
  overrideSlot?: boolean
  override_slot?: boolean
}

function isOverrideSlot(b: CalBooking): boolean {
  return Boolean(b.overrideSlot ?? b.override_slot)
}

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function bookingStart(b: CalBooking): Date | null {
  const slot = b.slotStart ?? b.slot_start
  if (slot) return new Date(slot)
  const session = b.sessionDate ?? b.session_date
  if (session) {
    const d = new Date(session)
    if (!Number.isNaN(d.getTime())) d.setUTCHours(12, 0, 0, 0)
    return d
  }
  return null
}

function bookingDayKey(b: CalBooking): string | null {
  const slot = b.slotStart ?? b.slot_start
  if (slot) return practiceDateIso(slot)
  const start = bookingStart(b)
  return start ? practiceDateIso(start) : null
}

function timeLabel(b: CalBooking) {
  const slot = b.slotStart ?? b.slot_start
  if (slot) return formatPracticeTime(slot)
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
  return formatPhoneDisplay(b.patientPhone || b.patient_phone)
}

function dateLabel(b: CalBooking) {
  const start = bookingStart(b)
  if (!start) return "—"
  return formatPracticeDateTime(start)
}

function BookingHoverDetails({ booking }: { booking: CalBooking }) {
  return (
    <div className="w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900 sm:w-96">
      <p className="text-base font-bold text-neutral-900 dark:text-white">
        {patientLabel(booking)}
      </p>
      <dl className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
        {booking.patient?.mrn?.trim() ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">MRN</dt>
            <dd className="font-semibold tabular-nums tracking-wide">
              {booking.patient.mrn.trim()}
            </dd>
          </div>
        ) : null}
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
            {booking.provider?.name ? drName(booking.provider.name) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Disease</dt>
          <dd className="text-right font-semibold">
            {booking.disease ||
              consultationTypeLabel(
                booking.consultationType || booking.consultation_type,
              ) ||
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
              {isOverrideSlot(booking) ? (
                <span
                  title="Kept outside the doctor's schedule after a schedule change"
                  className="ml-1.5 rounded-full border border-amber-400 bg-amber-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100"
                >
                  Override slot
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-xs opacity-80">
              {booking.provider?.name
                ? drName(booking.provider.name)
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
    hydrated,
    loading: shellLoading,
    error: shellError,
    isClinicAdmin,
    membershipRole,
    actorUserId,
  } = usePracticeDashboard()
  const isFrontDesk = isClinicAdmin || membershipRole === "RECEPTIONIST"
  const [error, setError] = useState("")
  const [practiceId, setPracticeId] = useState("")
  const [practiceName, setPracticeName] = useState("")
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string }>>(
    [],
  )
  const [providerId, setProviderId] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [view, setView] = useState<ViewMode>("week")
  const [anchor, setAnchor] = useState(() => startOfToday())
  const loading = (!ready && shellLoading) || (ready && !hydrated)

  useEffect(() => {
    if (!ready || isFrontDesk || !actorUserId) return
    setProviderId(actorUserId)
  }, [ready, isFrontDesk, actorUserId])
  const [dayWindows, setDayWindows] = useState<
    Record<string, DayWindows | undefined>
  >({})
  const [quick, setQuick] = useState<QuickSlotRequest | null>(null)
  const [notice, setNotice] = useState<{
    text: string
    tone: "ok" | "error"
    undo?: {
      providerId: string
      extra: TimeWindow & { id: string }
      scope: "one" | "series"
    }
  } | null>(null)

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

    const unique = Array.from(new Map(roster.map((d) => [d.id, d])).values())
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

  const columns = useMemo(() => {
    if (providerId === "all") return doctors
    const match = doctors.filter((d) => d.id === providerId)
    return match.length ? match : [{ id: providerId, name: "You" }]
  }, [doctors, providerId])

  const canCreateFor = useCallback(
    (id: string) => isFrontDesk || id === actorUserId,
    [isFrontDesk, actorUserId],
  )
  const creatableDoctors = useMemo(
    () => doctors.filter((d) => canCreateFor(d.id)),
    [doctors, canCreateFor],
  )

  const columnKey = columns.map((c) => c.id).join(",")
  const loadDayWindows = useCallback(async () => {
    if (!practiceId || view !== "day" || !columnKey) {
      setDayWindows({})
      return
    }
    const date = ymd(anchor)
    const ids = columnKey.split(",")
    const results = await Promise.all(
      ids.map((id) => proctoService.getCalendarDay(practiceId, id, date)),
    )
    const next: Record<string, DayWindows | undefined> = {}
    ids.forEach((id, i) => {
      const res = results[i]
      if (res.status === "successful" && res.data?.windows)
        next[id] = res.data.windows
    })
    setDayWindows(next)
  }, [practiceId, view, anchor, columnKey])

  useEffect(() => {
    setDayWindows({})
    void loadDayWindows()
  }, [loadDayWindows])

  const windowSeed = useMemo(() => {
    const date = ymd(anchor)
    const seed: Record<string, DayWindows | undefined> = {}
    for (const [id, w] of Object.entries(dayWindows)) seed[`${id}:${date}`] = w
    return seed
  }, [dayWindows, anchor])

  async function removeExtra(
    targetProviderId: string,
    extra: TimeWindow & { id: string },
    scope: "one" | "series" = "one",
  ) {
    const res = await proctoService.removeExtraSlots(
      practiceId,
      extra.id,
      scope,
    )
    if (res.status === "successful") {
      setNotice({
        text: res.data?.message || `Removed extra slots ${windowLabel(extra)}.`,
        tone: "ok",
      })
      void loadDayWindows()
    } else {
      setNotice({
        text: res.message || "Could not remove those slots.",
        tone: "error",
      })
    }
  }

  function quickCreateFromHeader(date: Date, el: HTMLElement) {
    const target =
      providerId !== "all" && canCreateFor(providerId)
        ? providerId
        : creatableDoctors[0]?.id
    if (!target) return
    const r = el.getBoundingClientRect()
    setQuick({
      providerId: target,
      date: ymd(date),
      anchor: { left: r.left, top: r.bottom, width: r.width, height: 0 },
    })
  }

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
            {isFrontDesk ? (
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
            ) : (
              <span className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                {doctors.find((d) => d.id === providerId)?.name || "You"}
              </span>
            )}
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

      {notice ? (
        <div
          role="status"
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          <span className="font-semibold">{notice.text}</span>
          <span className="flex items-center gap-2">
            {notice.undo ? (
              <button
                type="button"
                onClick={() => {
                  const u = notice.undo!
                  setNotice(null)
                  void removeExtra(u.providerId, u.extra, u.scope)
                }}
                className="rounded-lg border border-current px-2.5 py-1 text-xs font-bold"
              >
                Undo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="rounded-lg px-2 py-1 text-xs font-bold opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {view === "day" ? (
          <DayView
            day={anchor}
            bookings={dayBookings}
            columns={columns}
            windows={dayWindows}
            canCreate={canCreateFor}
            selection={
              quick &&
              quick.date === ymd(anchor) &&
              quick.start != null &&
              quick.end != null
                ? {
                    providerId: quick.providerId,
                    start: quick.start,
                    end: quick.end,
                  }
                : null
            }
            onQuickCreate={setQuick}
            onRemoveExtra={(id, extra, scope) =>
              void removeExtra(id, extra, scope)
            }
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
            onAddSlot={
              creatableDoctors.length ? quickCreateFromHeader : undefined
            }
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

      {quick ? (
        <QuickSlotPopover
          key={`${quick.providerId}:${quick.date}:${quick.start ?? ""}:${quick.end ?? ""}`}
          practiceId={practiceId}
          doctors={
            creatableDoctors.length
              ? creatableDoctors
              : columns.filter((c) => canCreateFor(c.id))
          }
          request={quick}
          seed={windowSeed}
          onClose={() => setQuick(null)}
          onCreated={(result, target) => {
            setQuick(null)
            setNotice({
              text: result.message,
              tone: "ok",
              undo: {
                providerId: target.providerId,
                extra: {
                  id: result.seriesId ?? result.id,
                  start: result.startTime,
                  end: result.endTime,
                },
                scope: result.seriesId ? "series" : "one",
              },
            })
            if (view === "day" && target.date === ymd(anchor))
              void loadDayWindows()
          }}
        />
      ) : null}
    </div>
  )
}

function DayView({
  day,
  bookings,
  columns,
  windows,
  canCreate,
  selection,
  onQuickCreate,
  onRemoveExtra,
}: {
  day: Date
  bookings: CalBooking[]
  columns: Array<{ id: string; name: string }>
  windows: Record<string, DayWindows | undefined>
  canCreate: (providerId: string) => boolean
  selection: { providerId: string; start: number; end: number } | null
  onQuickCreate: (req: QuickSlotRequest) => void
  onRemoveExtra: (
    providerId: string,
    extra: TimeWindow & { id: string },
    scope: "one" | "series",
  ) => void
}) {
  const dateIso = ymd(day)
  const today = practiceTodayIso()
  const byId = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])),
    [bookings],
  )
  const timed = useMemo(() => {
    const out: GridBooking[] = []
    for (const b of bookings) {
      const slot = b.slotStart ?? b.slot_start
      const pid = b.providerId ?? b.provider?.id
      if (!slot || !pid) continue
      const end = b.slot_end ?? (b as { slotEnd?: string | null }).slotEnd
      out.push({
        id: b.id,
        providerId: pid,
        start: new Date(slot),
        end: end ? new Date(end) : null,
      })
    }
    return out
  }, [bookings])
  const tokens = bookings.filter((b) => !(b.slotStart || b.slot_start))

  return (
    <CalendarDayGrid
      dateIso={dateIso}
      isToday={dateIso === today}
      isPast={dateIso < today}
      columns={columns}
      bookings={timed}
      windows={windows}
      canCreate={canCreate}
      selection={selection}
      onQuickCreate={onQuickCreate}
      onRemoveExtra={onRemoveExtra}
      renderBooking={(id) => {
        const b = byId.get(id)
        return b ? <BookingCard booking={b} compact /> : null
      }}
      footer={
        tokens.length > 0 ? (
          <div className="border-t border-neutral-200 px-4 py-4 dark:border-neutral-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
              Token queue · {format(day, "d MMM")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tokens.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          </div>
        ) : null
      }
    />
  )
}

function WeekView({
  days,
  byDay,
  onSelectDay,
  onAddSlot,
}: {
  days: Date[]
  byDay: Map<string, CalBooking[]>
  onSelectDay: (d: Date) => void
  onAddSlot?: (d: Date, el: HTMLElement) => void
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
              <div className="group relative shrink-0">
                {onAddSlot && d >= today ? (
                  <button
                    type="button"
                    onClick={(e) => onAddSlot(d, e.currentTarget)}
                    className="absolute right-2 top-2 z-10 rounded-lg border border-[var(--theme-primary)]/40 bg-white px-2 py-1 text-xs font-bold text-[var(--theme-primary)] opacity-0 transition hover:bg-[var(--theme-primary)]/10 focus:opacity-100 group-hover:opacity-100 dark:bg-neutral-900"
                  >
                    + Slot
                  </button>
                ) : null}
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
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {list.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
                {!list.length ? (
                  <p className="px-1 py-6 text-center text-xs opacity-40">—</p>
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
