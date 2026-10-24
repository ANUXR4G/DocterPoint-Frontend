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
import { isPracticingDoctor } from "@/lib/rosterDoctor"
import {
  formatPracticeDateTime,
  formatPracticeTime,
  practiceDateIso,
  practiceSlotStartIso,
  practiceTodayIso,
} from "@/lib/practiceTime"
import {
  proctoService,
  type DayWindows,
  type PracticePermissionScope,
  type ProctoBooking,
  type TimeWindow,
} from "@/lib/services/procto"
import { drName, hm12, windowLabel } from "@/lib/quickSlots"
import CalendarDayGrid, {
  type GridBooking,
} from "@/components/ui/procto/CalendarDayGrid"
import ClinicBookAppointmentModal, {
  type ClinicBookPrefill,
} from "@/components/ui/procto/ClinicBookAppointmentModal"
import BookingStatusControls from "@/components/ui/procto/BookingStatusControls"
import QuickSlotPopover, {
  type QuickSlotRequest,
} from "@/components/ui/procto/QuickSlotPopover"
import {
  filterBookingsByRange,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"
import {
  isTerminalVisitStatus,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import { isEmergencyWalkIn } from "@/lib/bookingDisplay"
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

/** Calendar chip colours — matches the status legend (Cancelled = red). */
function statusClass(booking: Pick<CalBooking, "status" | "paymentStatus" | "payment_status" | "consultationType" | "consultation_type">) {
  const status = String(booking.status || "").toUpperCase()
  const paid = String(
    booking.paymentStatus ?? booking.payment_status ?? "",
  ).toUpperCase() === "PAID"

  if (status === "CANCELED" || status === "CANCELLED") {
    return "bg-red-500 text-white border-red-600 dark:bg-red-600 dark:text-white dark:border-red-500"
  }
  if (status === "NO_SHOW") {
    return "bg-[#FFF4CC] text-[#8A6A08] border-[#E6B325] dark:bg-[#3d3208] dark:text-[#F3D36B] dark:border-[#E6B325]"
  }
  if (status === "COMPLETED") {
    return "bg-green-700 text-white border-green-800 dark:bg-green-700 dark:text-white dark:border-green-600"
  }
  if (status === "IN_PROGRESS") {
    return "bg-green-300 text-green-950 border-green-400 dark:bg-green-800/70 dark:text-green-50 dark:border-green-600"
  }
  if (status === "WAITING" || status === "CHECKED_IN") {
    return "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700"
  }
  if (isEmergencyWalkIn(booking)) {
    return "bg-yellow-300 text-yellow-950 border-yellow-400 dark:bg-yellow-700/50 dark:text-yellow-50 dark:border-yellow-500"
  }
  if (paid) {
    return "bg-blue-500 text-white border-blue-600 dark:bg-blue-600 dark:text-white dark:border-blue-500"
  }
  // Booked / accepted / scheduled
  return "bg-orange-200 text-orange-950 border-orange-300 dark:bg-orange-900/50 dark:text-orange-50 dark:border-orange-700"
}

const CALENDAR_STATUS_LEGEND: Array<{ label: string; swatch: string }> = [
  { label: "Free Slots", swatch: "border-2 border-neutral-800 bg-white dark:border-white dark:bg-neutral-900" },
  { label: "Break Time", swatch: "bg-neutral-400 dark:bg-neutral-500" },
  { label: "Emergency Walkin", swatch: "bg-yellow-400" },
  { label: "Arrived", swatch: "bg-emerald-200 dark:bg-emerald-400" },
  { label: "Consultation Started", swatch: "bg-green-400" },
  { label: "Cancelled", swatch: "bg-red-500" },
  { label: "No Show", swatch: "bg-amber-400" },
  { label: "Booked", swatch: "bg-orange-300" },
  { label: "Consultation Completed", swatch: "bg-green-700" },
  { label: "Fee Paid", swatch: "bg-blue-500" },
]

function CalendarStatusLegend() {
  return (
    <div
      className="max-h-[30%] shrink-0 overflow-y-auto border-t border-neutral-200 px-1 pt-3 dark:border-neutral-700"
      aria-label="Calendar status colours"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {CALENDAR_STATUS_LEGEND.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300"
          >
            <span
              className={`inline-block size-3.5 shrink-0 rounded-full ${item.swatch}`}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function phoneOf(b: CalBooking) {
  return formatPhoneDisplay(b.patientPhone || b.patient_phone)
}

function dateLabel(b: CalBooking) {
  const start = bookingStart(b)
  if (!start) return "—"
  return formatPracticeDateTime(start)
}

function BookingDetails({
  booking,
  doctorName,
  onClose,
  allowStatusChange = true,
}: {
  booking: CalBooking
  doctorName?: string | null
  onClose: () => void
  allowStatusChange?: boolean
}) {
  const { patchBooking } = usePracticeDashboard()
  const [statusBusy, setStatusBusy] = useState(false)

  async function onStatus(status: string, reason?: string) {
    if (!allowStatusChange || isTerminalVisitStatus(booking.status)) return
    const previous = booking.status
    setStatusBusy(true)
    patchBooking(booking.id, { status })
    const res = await proctoService.updateBookingStatus(booking.id, status, reason)
    setStatusBusy(false)
    if (res.status !== "successful") {
      patchBooking(booking.id, { status: previous })
      return
    }
    const arrivedAt = (res.data as { arrivedAt?: string | null } | undefined)
      ?.arrivedAt
    if (arrivedAt !== undefined) patchBooking(booking.id, { arrivedAt })
  }

  return (
    <div className="w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900 sm:w-96">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-bold text-neutral-900 dark:text-white">
          {patientLabel(booking)}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-1 -mt-1 rounded-lg px-2 py-0.5 text-lg leading-none text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          ×
        </button>
      </div>
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
            {booking.provider?.name
              ? drName(booking.provider.name)
              : doctorName
                ? drName(doctorName)
                : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Chief complaint</dt>
          <dd className="text-right font-semibold">
            {booking.disease?.trim() || "No chief complaint"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Mode</dt>
          <dd className="font-semibold">
            {(booking.mode || "").replace(/_/g, " ") || "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-700">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide opacity-60">
          Visit status
        </p>
        <BookingStatusControls
          status={booking.status}
          busy={statusBusy}
          compact
          allowChange={allowStatusChange}
          visitHref={`/doctor/queue/${booking.id}`}
          onChange={(status, reason) => void onStatus(status, reason)}
        />
      </div>
      <Link
        href={`/doctor/queue/${booking.id}`}
        className="mt-3 block border-t border-neutral-100 pt-3 text-xs font-bold text-[var(--theme-primary)] hover:underline dark:border-neutral-700"
      >
        Open visit →
      </Link>
    </div>
  )
}

const MOVABLE = new Set(["SCHEDULED", "REQUESTED", "ACCEPTED"])

function canMoveBooking(b: CalBooking) {
  if (!MOVABLE.has(String(b.status || "").toUpperCase())) return false
  const slot = b.slotStart ?? b.slot_start
  if (!slot) return false
  return new Date(slot).getTime() > Date.now() - 60_000
}

function BookingCard({
  booking,
  compact = false,
  fill = false,
  showDoctor = false,
  doctorName,
  onCut,
  onActivate,
  allowStatusChange = true,
}: {
  booking: CalBooking
  compact?: boolean
  /** Stretch to a timed day-grid slot. Week and month chips stay content-sized. */
  fill?: boolean
  showDoctor?: boolean
  doctorName?: string | null
  onCut?: () => void
  onActivate?: () => void
  allowStatusChange?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Cut / the actions menu must not also open the booking details popup. */
  const suppressOpen = useRef(false)

  const docDisplayName = doctorName
    ? drName(doctorName)
    : booking.provider?.name
      ? drName(booking.provider.name)
      : null

  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelW = 384
    const panelH = 420
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

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      close()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.("[data-cal-menu]")) return
      close()
    }
    document.addEventListener("mousedown", onDown)
    window.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("scroll", close, true)
    }
  }, [menu])

  return (
    <div
      ref={ref}
      className={`relative ${fill ? "h-full" : ""}`}
      onContextMenu={(e) => {
        if (!onCut) return
        e.preventDefault()
        e.stopPropagation()
        suppressOpen.current = true
        window.setTimeout(() => {
          suppressOpen.current = false
        }, 0)
        setOpen(false)
        setMenu({ top: e.clientY, left: e.clientX })
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (suppressOpen.current) {
            suppressOpen.current = false
            return
          }
          onActivate?.()
          if (open) setOpen(false)
          else show()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation()
        }}
        className={`block w-full rounded-lg border text-left transition hover:brightness-[0.98] dark:hover:brightness-110 ${fill ? "h-full" : ""} ${statusClass(booking)} ${
          compact ? "px-1.5 py-1" : "px-2.5 py-2"
        } ${open ? "ring-2 ring-[var(--theme-primary)] ring-offset-1 dark:ring-offset-neutral-900" : ""}`}
      >
        {compact ? (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight">
              {timeLabel(booking)} {patientLabel(booking)}
            </p>
            {showDoctor && docDisplayName ? (
              <p className="mt-0.5 truncate text-[10px] font-medium text-sky-700 dark:text-sky-300">
                {docDisplayName}
              </p>
            ) : null}
          </div>
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
              {[
                showDoctor ? docDisplayName : null,
                booking.disease?.trim() || "No chief complaint",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        )}
      </button>
      {onCut ? (
        <button
          type="button"
          data-cal-menu
          aria-label="Appointment actions"
          className="absolute right-0.5 top-0.5 z-10 rounded px-1 text-sm leading-none opacity-70 hover:bg-black/10 hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            suppressOpen.current = true
            window.setTimeout(() => {
              suppressOpen.current = false
            }, 0)
            setOpen(false)
            const r = e.currentTarget.getBoundingClientRect()
            const menuH = 48
            const below = r.bottom + 4
            const top =
              below + menuH > window.innerHeight - 8
                ? Math.max(8, r.top - menuH - 4)
                : below
            setMenu({ top, left: Math.max(8, r.right - 180) })
          }}
        >
          ⋮
        </button>
      ) : null}
      {menu
        ? createPortal(
            <div
              data-cal-menu
              role="menu"
              className="fixed z-[9999] w-44 rounded-xl border border-neutral-200 bg-white p-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
              style={{ top: menu.top, left: menu.left }}
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full rounded-lg px-3 py-2 text-left font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  suppressOpen.current = true
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  suppressOpen.current = true
                  window.setTimeout(() => {
                    suppressOpen.current = false
                  }, 0)
                  setOpen(false)
                  onCut?.()
                  setMenu(null)
                }}
              >
                Cut appointment
              </button>
            </div>,
            document.body,
          )
        : null}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={`Booking details for ${patientLabel(booking)}`}
              className="fixed z-[9999]"
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Escape") setOpen(false)
              }}
            >
              <BookingDetails
                booking={booking}
                doctorName={docDisplayName}
                onClose={() => setOpen(false)}
                allowStatusChange={allowStatusChange}
              />
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
    lastCalendarEvent,
    refresh: refreshDashboard,
  } = usePracticeDashboard()
  const isFrontDesk =
    isClinicAdmin ||
    membershipRole === "RECEPTIONIST" ||
    membershipRole === "NURSE"
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
  const [bookOpen, setBookOpen] = useState(false)
  const [bookPrefill, setBookPrefill] = useState<ClinicBookPrefill | null>(null)
  const [clipboard, setClipboard] = useState<CalBooking | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveAsk, setMoveAsk] = useState<{
    booking: CalBooking
    providerId: string
    date: string
    startMinutes: number
    notify: boolean
  } | null>(null)
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
          isPracticingDoctor(m),
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

  const doctorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of doctors) {
      if (d.id) map.set(d.id, d.name)
    }
    const practice = (memberships[0] as unknown as Membership)?.practice
    if (practice?.members) {
      for (const m of practice.members) {
        const name = m.user?.name || m.user?.email || "Doctor"
        if (m.userId) map.set(m.userId, name)
        if (m.user?.id) map.set(m.user.id, name)
        const row = m as { doctorId?: string | null }
        if (row.doctorId) map.set(row.doctorId, name)
      }
    }
    return map
  }, [doctors, memberships])

  const [slotScope, setSlotScope] = useState<
    PracticePermissionScope | undefined
  >(undefined)
  const [bookScope, setBookScope] = useState<
    PracticePermissionScope | undefined
  >(undefined)
  const [moveScope, setMoveScope] = useState<
    PracticePermissionScope | undefined
  >(undefined)
  const [statusScope, setStatusScope] = useState<
    PracticePermissionScope | undefined
  >(undefined)
  useEffect(() => {
    if (!practiceId) return
    let alive = true
    void proctoService.getMyPracticePermissions(practiceId).then((res) => {
      if (!alive || res.status !== "successful" || !res.data?.permissions) return
      const p = res.data.permissions
      setSlotScope(p.MANAGE_SLOTS_INLINE ?? null)
      setBookScope(p.CREATE_APPOINTMENT ?? null)
      setMoveScope(p.UPDATE_APPOINTMENT ?? null)
      setStatusScope(p.CHANGE_BOOKING_STATUS ?? null)
    })
    return () => {
      alive = false
    }
  }, [practiceId])

  // Until the server answers, fall back to the membership role; save is enforced server-side.
  const scope =
    slotScope === undefined ? (isFrontDesk ? "ANY" : "OWN") : slotScope
  const bookingScope =
    bookScope === undefined ? (isFrontDesk ? "ANY" : "OWN") : bookScope
  const rescheduleScope =
    moveScope === undefined ? (isFrontDesk ? "ANY" : "OWN") : moveScope
  const queueStatusScope =
    statusScope === undefined ? (isFrontDesk ? "ANY" : "OWN") : statusScope
  const canManageSlotsFor = useCallback(
    (id: string) => scope === "ANY" || (scope === "OWN" && id === actorUserId),
    [scope, actorUserId],
  )
  const canCreateFor = useCallback(
    (id: string) =>
      bookingScope === "ANY" ||
      (bookingScope === "OWN" && id === actorUserId),
    [bookingScope, actorUserId],
  )
  const canMoveFor = useCallback(
    (id: string) =>
      rescheduleScope === "ANY" ||
      (rescheduleScope === "OWN" && id === actorUserId),
    [rescheduleScope, actorUserId],
  )
  const canChangeStatusFor = useCallback(
    (id: string) =>
      queueStatusScope === "ANY" ||
      (queueStatusScope === "OWN" && id === actorUserId),
    [queueStatusScope, actorUserId],
  )
  const creatableDoctors = useMemo(
    () => doctors.filter((d) => canCreateFor(d.id)),
    [doctors, canCreateFor],
  )
  const slotDoctors = useMemo(
    () => doctors.filter((d) => canManageSlotsFor(d.id)),
    [doctors, canManageSlotsFor],
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
      if (res.status === "successful" && res.data?.windows) {
        next[id] = {
          ...res.data.windows,
          mode: res.data.windows.mode ?? res.data.configuredMode ?? null,
        }
      }
    })
    setDayWindows(next)
  }, [practiceId, view, anchor, columnKey])

  useEffect(() => {
    void loadDayWindows()
  }, [loadDayWindows])

  useEffect(() => {
    if (!lastCalendarEvent || view !== "day") return
    if (
      lastCalendarEvent.dates.includes(ymd(anchor)) &&
      columnKey.split(",").includes(lastCalendarEvent.providerId)
    )
      void loadDayWindows()
    // Only react to new events, not to navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCalendarEvent])

  const [freshIds, setFreshIds] = useState<string[]>([])
  useEffect(() => {
    if (!freshIds.length) return
    const t = window.setTimeout(() => setFreshIds([]), 6000)
    return () => window.clearTimeout(t)
  }, [freshIds])

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

  function cutBooking(b: CalBooking) {
    if (!canMoveBooking(b)) return
    setClipboard(b)
    setFocusedId(b.id)
    setMoveAsk(null)
    setNotice({
      text: `${patientLabel(b)} cut. Open a day, click a slot, then Paste.`,
      tone: "ok",
    })
  }

  function askMove(
    booking: CalBooking,
    providerId: string,
    date: string,
    startMinutes: number,
  ) {
    const fromId = booking.providerId ?? booking.provider?.id ?? ""
    if (!canMoveFor(fromId) || !canMoveFor(providerId)) {
      setNotice({
        text: "Your role cannot reschedule appointments for that doctor.",
        tone: "error",
      })
      return
    }
    setMoveAsk({ booking, providerId, date, startMinutes, notify: true })
  }

  function canMoveBookingPerm(b: CalBooking) {
    if (!canMoveBooking(b)) return false
    const pid = b.providerId ?? b.provider?.id
    return Boolean(pid && canMoveFor(pid))
  }

  function canChangeStatusPerm(b: CalBooking) {
    const pid = b.providerId ?? b.provider?.id
    return Boolean(pid && canChangeStatusFor(pid))
  }

  async function confirmMove() {
    if (!moveAsk || moving) return
    setMoving(true)
    const res = await proctoService.moveBooking(moveAsk.booking.id, {
      providerId: moveAsk.providerId,
      slotStart: practiceSlotStartIso(moveAsk.date, moveAsk.startMinutes),
      notifyPatient: moveAsk.notify,
    })
    setMoving(false)
    if (res.status === "successful") {
      const name = patientLabel(moveAsk.booking)
      const told = moveAsk.notify
      setClipboard((cur) => (cur?.id === moveAsk.booking.id ? null : cur))
      setMoveAsk(null)
      void refreshDashboard({ silent: true })
      setNotice({
        text: told
          ? `${name} moved. WhatsApp update queued.`
          : `${name} moved.`,
        tone: "ok",
      })
      return
    }
    setNotice({
      text: res.message || "That slot is not free for the full visit.",
      tone: "error",
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      const key = e.key.toLowerCase()
      if (key === "x") {
        const b = visibleBookings.find((row) => row.id === focusedId)
        if (!b || !canMoveBooking(b)) return
        e.preventDefault()
        cutBooking(b)
      }
      if (key === "v" && clipboard && moveAsk?.booking.id === clipboard.id) {
        e.preventDefault()
        void confirmMove()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

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
              title={
                view === "week"
                  ? "Go to current week"
                  : view === "month"
                  ? "Go to current month"
                  : "Go to today"
              }
            >
              {view === "week" ? "Week" : view === "month" ? "Month" : "Today"}
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

      {clipboard ? (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            ✂️ {patientLabel(clipboard)} — Cut. Select a new date and slot, then
            Paste.
          </span>
          <button
            type="button"
            onClick={() => {
              setClipboard(null)
              setMoveAsk((cur) =>
                cur?.booking.id === clipboard.id ? null : cur,
              )
            }}
            className="rounded-lg border border-current px-2.5 py-1 text-xs font-bold"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {moveAsk ? (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/10 px-3 py-2 text-sm">
          <span>
            Move {patientLabel(moveAsk.booking)} to{" "}
            {drName(
              columns.find((c) => c.id === moveAsk.providerId)?.name ||
                "that doctor",
            )}{" "}
            at {hm12(moveAsk.startMinutes)}?
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <input
                type="checkbox"
                checked={moveAsk.notify}
                onChange={(e) =>
                  setMoveAsk((cur) =>
                    cur ? { ...cur, notify: e.target.checked } : cur,
                  )
                }
              />
              WhatsApp the patient
            </label>
            <button
              type="button"
              disabled={moving}
              onClick={() => void confirmMove()}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {clipboard?.id === moveAsk.booking.id ? "Paste" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setMoveAsk(null)}
              className="rounded-lg border border-current px-2.5 py-1 text-xs font-bold"
            >
              Undo
            </button>
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "day" ? (
            <DayView
              day={anchor}
              bookings={dayBookings}
              columns={columns}
              windows={dayWindows}
              canCreate={canCreateFor}
              canMoveBooking={canMoveBookingPerm}
              canChangeStatus={canChangeStatusPerm}
              onFocusDoctor={
                providerId === "all" ? (id) => setProviderId(id) : undefined
              }
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
              onBookSlot={(req) => {
                if (clipboard && req.start != null) {
                  askMove(clipboard, req.providerId, req.date, req.start)
                  return
                }
                setBookPrefill({
                  providerId: req.providerId,
                  date: req.date,
                  startMinutes: req.start,
                  endMinutes: req.end,
                })
                setBookOpen(true)
              }}
              onMoveBooking={(move) => {
                const b = dayBookings.find((row) => row.id === move.bookingId)
                if (!b || !canMoveBooking(b)) return
                askMove(b, move.providerId, move.date, move.start)
              }}
              onCut={cutBooking}
              onActivate={setFocusedId}
              onRemoveExtra={(id, extra, scope) =>
                void removeExtra(id, extra, scope)
              }
              freshIds={freshIds}
            />
          ) : null}

          {view === "week" ? (
            <WeekView
              days={weekDays}
              byDay={byDay}
              showDoctor={providerId === "all"}
              doctorMap={doctorMap}
              onSelectDay={(d) => {
                setAnchor(d)
                setView("day")
              }}
              onAddSlot={
                slotDoctors.length ? quickCreateFromHeader : undefined
              }
              onCut={cutBooking}
              onActivate={setFocusedId}
              canMoveBooking={canMoveBookingPerm}
              canChangeStatus={canChangeStatusPerm}
            />
          ) : null}

          {view === "month" ? (
            <MonthView
              anchor={anchor}
              days={monthDays}
              byDay={byDay}
              doctorMap={doctorMap}
              onSelectDay={(d) => {
                setAnchor(d)
                setView("day")
              }}
              onCut={cutBooking}
              onActivate={setFocusedId}
              canMoveBooking={canMoveBookingPerm}
              canChangeStatus={canChangeStatusPerm}
            />
          ) : null}
        </div>

        <CalendarStatusLegend />
      </div>

      <ClinicBookAppointmentModal
        open={bookOpen}
        prefill={bookPrefill}
        onClose={() => {
          setBookOpen(false)
          setBookPrefill(null)
        }}
        onBooked={() => {
          setBookOpen(false)
          setBookPrefill(null)
          void refreshDashboard({ silent: true })
          setNotice({ text: "Appointment booked.", tone: "ok" })
        }}
      />

      {quick ? (
        <QuickSlotPopover
          key={`${quick.providerId}:${quick.date}:${quick.start ?? ""}:${quick.end ?? ""}`}
          practiceId={practiceId}
          doctors={
            slotDoctors.length
              ? slotDoctors
              : columns.filter((c) => canManageSlotsFor(c.id))
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
            setFreshIds(result.ids?.length ? result.ids : [result.id])
            const onScreen =
              view === "day" &&
              target.date === ymd(anchor) &&
              columns.some((c) => c.id === target.providerId)
            if (onScreen) {
              void loadDayWindows()
            } else {
              if (providerId !== "all" && providerId !== target.providerId)
                setProviderId(target.providerId)
              setAnchor(new Date(`${target.date}T00:00:00`))
              setView("day")
            }
          }}
        />
      ) : null}
    </div>
  )
}

function TokenDayView({
  day,
  bookings,
  columns,
  windows,
  canCreate,
  onActivate,
  onCut,
  canMoveBooking,
  canChangeStatus = () => true,
  onBookToken,
  onFocusDoctor,
}: {
  day: Date
  bookings: CalBooking[]
  columns: Array<{ id: string; name: string }>
  windows: Record<string, DayWindows | undefined>
  canCreate: (providerId: string) => boolean
  onActivate: (id: string) => void
  onCut: (booking: CalBooking) => void
  canMoveBooking: (b: CalBooking) => boolean
  canChangeStatus?: (b: CalBooking) => boolean
  onBookToken?: (providerId: string) => void
  onFocusDoctor?: (providerId: string) => void
}) {
  const byProvider = useMemo(() => {
    const map = new Map<string, CalBooking[]>()
    for (const b of bookings) {
      const pid =
        b.providerId ??
        b.provider?.id ??
        (columns.length === 1 ? columns[0].id : null)
      if (!pid) continue
      const list = map.get(pid) ?? []
      list.push(b)
      map.set(pid, list)
    }
    return map
  }, [bookings, columns])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-auto overflow-y-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
      <div
        className="grid h-full min-h-0 min-w-[320px] flex-1 divide-x divide-neutral-100 dark:divide-neutral-800"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(260px, 1fr))`,
        }}
      >
        {columns.map((c) => {
          const w = windows[c.id]
          const list = (byProvider.get(c.id) ?? []).sort(
            (a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0),
          )
          const summary = !w
            ? "Loading…"
            : w.dayOff
              ? "On leave"
              : w.hours.length
                ? `${w.hours.map(windowLabel).join(", ")} · Token queue`
                : "Token queue"

          return (
            <div key={c.id} className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 p-3 dark:border-neutral-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {onFocusDoctor && columns.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onFocusDoctor(c.id)}
                        title={`Show calendar for ${drName(c.name)} only`}
                        className="truncate text-left text-sm font-bold text-neutral-900 underline-offset-2 hover:text-[var(--theme-primary)] hover:underline dark:text-white dark:hover:text-[var(--theme-primary)]"
                      >
                        {drName(c.name)}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                        {drName(c.name)}
                      </p>
                    )}
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-black">
                      {list.length} token{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs opacity-60">{summary}</p>
                </div>
                {onBookToken && canCreate(c.id) && !w?.dayOff ? (
                  <button
                    type="button"
                    onClick={() => onBookToken(c.id)}
                    className="shrink-0 rounded-lg border border-[var(--theme-primary)]/40 bg-white px-2 py-1 text-xs font-bold text-[var(--theme-primary)] transition hover:bg-[var(--theme-primary)]/10 dark:bg-neutral-900"
                  >
                    + Book Token
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {w?.dayOff ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                    On leave{w.dayOff.reason ? ` — ${w.dayOff.reason}` : ""}
                  </div>
                ) : null}

                {list.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    compact={false}
                    doctorName={c.name}
                    onActivate={() => onActivate(b.id)}
                    onCut={canMoveBooking(b) ? () => onCut(b) : undefined}
                    allowStatusChange={canChangeStatus(b)}
                  />
                ))}

                {!list.length && !w?.dayOff ? (
                  <p className="px-1 py-12 text-center text-xs opacity-40">
                    No token bookings for this day.
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

export function isTokenBooking(b: Partial<CalBooking>): boolean {
  if (b.tokenNumber != null || b.token_number != null) return true
  if ((b as { mode?: string }).mode === "TOKEN_BASED") return true
  // Slot-less visit on a token day (no clock time assigned yet)
  return !(b.slotStart || b.slot_start)
}

export function isTimedBooking(b: Partial<CalBooking>): boolean {
  return (
    Boolean(b.slotStart || b.slot_start) &&
    b.tokenNumber == null &&
    b.token_number == null &&
    (b as { mode?: string }).mode !== "TOKEN_BASED"
  )
}

export function isTokenModeDay(
  columns: Array<{ id: string }>,
  windows: Record<string, { mode?: string | null } | undefined>,
  bookings: CalBooking[],
): boolean {
  const tokens = bookings.filter(isTokenBooking)
  const timed = bookings.filter(isTimedBooking)

  // If there are timed bookings on the day, keep the timed grid for their exact slot times
  if (timed.length > 0) return false

  // If there are token bookings and no timed bookings, show token day view
  if (tokens.length > 0) return true

  // If all columns with a configured mode are TOKEN_BASED (and at least one is configured)
  const configured = columns.map((c) => windows[c.id]?.mode).filter(Boolean)
  if (configured.length > 0 && configured.every((m) => m === "TOKEN_BASED")) {
    return true
  }

  const allTokenMode =
    columns.length > 0 &&
    columns.every((c) => windows[c.id]?.mode === "TOKEN_BASED")

  return allTokenMode
}

function DayView({
  day,
  bookings,
  columns,
  windows,
  canCreate,
  canMoveBooking,
  canChangeStatus,
  selection,
  onQuickCreate,
  onBookSlot,
  onMoveBooking,
  onCut,
  onActivate,
  onRemoveExtra,
  freshIds,
  onFocusDoctor,
}: {
  day: Date
  bookings: CalBooking[]
  columns: Array<{ id: string; name: string }>
  windows: Record<string, DayWindows | undefined>
  canCreate: (providerId: string) => boolean
  canMoveBooking: (booking: CalBooking) => boolean
  canChangeStatus: (booking: CalBooking) => boolean
  selection: { providerId: string; start: number; end: number } | null
  onQuickCreate: (req: QuickSlotRequest) => void
  onBookSlot?: (req: QuickSlotRequest) => void
  onMoveBooking?: (move: {
    bookingId: string
    providerId: string
    start: number
    date: string
  }) => void
  onCut: (booking: CalBooking) => void
  onActivate: (id: string) => void
  onRemoveExtra: (
    providerId: string,
    extra: TimeWindow & { id: string },
    scope: "one" | "series",
  ) => void
  freshIds: string[]
  onFocusDoctor?: (providerId: string) => void
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
      if (!isTimedBooking(b)) continue
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
  const tokens = useMemo(
    () => bookings.filter(isTokenBooking),
    [bookings],
  )

  // Always use the day grid so token queues render inside calendar columns
  // (not a separate list outside the calendar chrome).
  return (
    <CalendarDayGrid
      dateIso={dateIso}
      isToday={dateIso === today}
      isPast={dateIso < today}
      columns={columns}
      bookings={timed}
      tokenBookings={tokens.map((b) => ({
        id: b.id,
        providerId: b.providerId ?? b.provider?.id ?? "",
        tokenNumber: b.tokenNumber ?? b.token_number,
      }))}
      windows={windows}
      canCreate={canCreate}
      selection={selection}
      onQuickCreate={onQuickCreate}
      onBookSlot={onBookSlot}
      onMoveBooking={onMoveBooking}
      canDragBooking={(id) => {
        const row = byId.get(id)
        return !!row && canMoveBooking(row)
      }}
      onRemoveExtra={onRemoveExtra}
      freshIds={freshIds}
      onFocusDoctor={onFocusDoctor}
      renderBooking={(id) => {
        const b = byId.get(id)
        if (!b) return null
        const timedSlot = isTimedBooking(b)
        return (
          <BookingCard
            booking={b}
            compact
            fill={timedSlot}
            doctorName={
              columns.find(
                (c) => c.id === (b.providerId ?? b.provider?.id),
              )?.name
            }
            onActivate={() => onActivate(b.id)}
            onCut={canMoveBooking(b) ? () => onCut(b) : undefined}
            allowStatusChange={canChangeStatus(b)}
          />
        )
      }}
    />
  )
}

function WeekView({
  days,
  byDay,
  showDoctor = false,
  doctorMap,
  onSelectDay,
  onAddSlot,
  onCut,
  onActivate,
  canMoveBooking: canMove = canMoveBooking,
  canChangeStatus = () => true,
}: {
  days: Date[]
  byDay: Map<string, CalBooking[]>
  showDoctor?: boolean
  doctorMap?: Map<string, string>
  onSelectDay: (d: Date) => void
  onAddSlot?: (d: Date, el: HTMLElement) => void
  onCut: (booking: CalBooking) => void
  onActivate: (id: string) => void
  canMoveBooking?: (b: CalBooking) => boolean
  canChangeStatus?: (b: CalBooking) => boolean
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
                    {list.length}{" "}
                    {list.some(
                      (b) =>
                        b.tokenNumber != null ||
                        (b as { mode?: string }).mode === "TOKEN_BASED",
                    )
                      ? `token${list.length === 1 ? "" : "s"}`
                      : `slot${list.length === 1 ? "" : "s"}`}
                  </span>
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {list.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    compact
                    showDoctor={showDoctor}
                    doctorName={
                      b.provider?.name ||
                      doctorMap?.get(b.providerId ?? b.provider?.id ?? "")
                    }
                    onActivate={() => onActivate(b.id)}
                    onCut={canMove(b) ? () => onCut(b) : undefined}
                    allowStatusChange={canChangeStatus(b)}
                  />
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
  doctorMap,
  onSelectDay,
  onCut,
  onActivate,
  canMoveBooking: canMove = canMoveBooking,
  canChangeStatus = () => true,
}: {
  anchor: Date
  days: Date[]
  byDay: Map<string, CalBooking[]>
  doctorMap?: Map<string, string>
  onSelectDay: (d: Date) => void
  onCut: (booking: CalBooking) => void
  onActivate: (id: string) => void
  canMoveBooking?: (b: CalBooking) => boolean
  canChangeStatus?: (b: CalBooking) => boolean
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
                        <BookingCard
                          booking={b}
                          compact
                          doctorName={
                            b.provider?.name ||
                            doctorMap?.get(b.providerId ?? b.provider?.id ?? "")
                          }
                          onActivate={() => onActivate(b.id)}
                          onCut={canMove(b) ? () => onCut(b) : undefined}
                          allowStatusChange={canChangeStatus(b)}
                        />
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
