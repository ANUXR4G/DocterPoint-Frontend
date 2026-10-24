"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { MessageCircle, RefreshCw, Siren } from "lucide-react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import TablePagination from "@/components/pagination/TablePagination"
import { useClientPagination } from "@/hooks/useClientPagination"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  isTerminalVisitStatus,
  matchesQueueStatusFilter,
  type QueueStatusFilter,
} from "@/lib/bookingStatus"
import {
  chiefComplaintOf,
  formatArrival,
  formatBookingWhenDetailed,
  isEmergencyWalkIn,
  sortBookingsByWhen,
} from "@/lib/bookingDisplay"
import { isPracticingDoctor } from "@/lib/rosterDoctor"
import EmergencyWalkInBadge from "@/components/ui/procto/EmergencyWalkInBadge"
import EmergencyWalkInModal from "@/components/ui/procto/EmergencyWalkInModal"
import PaymentStatusButton from "@/components/ui/procto/PaymentStatusButton"
import {
  APPOINTMENT_RANGE_PRESETS,
  MAX_CUSTOM_RANGE_DAYS,
  daysBetween,
  formatIsoRange,
  resolvePresetRange,
  type AppointmentRangePreset,
  type IsoRange,
} from "@/lib/appointmentDateRange"
import {
  formatPracticeDate,
  formatPracticeTime,
  practiceTodayIso,
} from "@/lib/practiceTime"
import AppointmentDateRangeFilter from "@/components/ui/procto/AppointmentDateRangeFilter"
import { PatientNameHover } from "@/components/ui/procto/PatientBookingHover"
import BookingStatusControls from "@/components/ui/procto/BookingStatusControls"
import BookingStatusFilterBar from "@/components/ui/procto/BookingStatusFilterBar"
import ClinicBookAppointmentModal from "@/components/ui/procto/ClinicBookAppointmentModal"
import AppointmentChatModal from "@/components/ui/procto/AppointmentChatModal"
import PrescriptionActionsMenu from "@/components/ui/procto/PrescriptionActionsMenu"
import {
  bookingDateIso,
  usePracticeDashboard,
} from "@/contexts/PracticeDashboardContext"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import { withDrTitle } from "@/lib/doctorName"

function bookingDoctorName(b: ProctoBooking): string {
  const raw =
    b.provider?.name?.trim() ||
    (b as { providerName?: string | null }).providerName?.trim() ||
    ""
  return withDrTitle(raw) || "—"
}

function bookingPeerUserId(b: ProctoBooking): string | null {
  const id = (b.patient?.id || b.patientId || "").trim()
  return id || null
}

function bookingProviderId(b: ProctoBooking): string | null {
  return (
    b.provider?.id ||
    (b as { providerId?: string | null }).providerId ||
    null
  )
}

function bookingWhenParts(b: ProctoBooking): { day: string; time: string } {
  const slot = b.slotStart || (b as { slot_start?: string | null }).slot_start
  if (slot) {
    const d = new Date(slot)
    if (!Number.isNaN(d.getTime())) {
      return {
        day: formatPracticeDate(d),
        time: formatPracticeTime(d),
      }
    }
  }
  return { day: formatBookingWhenDetailed(b), time: "" }
}

function ChatIconButton({
  enabled,
  patientName,
  onOpen,
}: {
  enabled: boolean
  patientName?: string | null
  onOpen: () => void
}) {
  const label = enabled
    ? `Chat with ${patientName?.trim() || "patient"}`
    : "Chat unavailable — patient not linked to an account"
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        if (enabled) onOpen()
      }}
      disabled={!enabled}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed ${
        enabled
          ? "border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/20"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-500"
      }`}
    >
      <MessageCircle className="size-4" aria-hidden />
    </button>
  )
}

function ChiefComplaintField({
  value,
  busy,
  onSave,
}: {
  value: string
  busy: boolean
  onSave: (disease: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => {
    setText(value)
  }, [value])
  const empty = !text.trim()
  return (
    <input
      value={text}
      disabled={busy}
      maxLength={500}
      placeholder="Chief complaint (required)"
      required
      aria-required
      aria-label="Chief complaint"
      title="Chief complaint — type and leave the box to save"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim()
        if (next === value) return
        onSave(next)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className={`h-8 w-full min-w-0 rounded-md border bg-transparent px-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-[var(--theme-primary)] focus:outline-none disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-neutral-500 ${
        empty
          ? "border-dashed border-neutral-300 dark:border-neutral-600"
          : "border-neutral-200 dark:border-neutral-600"
      }`}
    />
  )
}

/** Clinic bookings from Procto — synced with backend queue/calendar. */
export default function DoctorAppointmentsList({
  portal = "doctor",
}: {
  portal?: "doctor" | "clinic"
} = {}) {
  const {
    ready,
    loading,
    error: loadError,
    practiceId,
    practiceName,
    memberships,
    patchBooking,
    refresh,
    bookings: cachedBookings,
    bookingTick,
    liveConnected,
  } = usePracticeDashboard()
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all")
  const [rangePreset, setRangePreset] =
    useState<AppointmentRangePreset>("today")
  const [customRange, setCustomRange] = useState<IsoRange>(() => {
    const today = practiceTodayIso()
    return { from: today, to: today }
  })
  const [doctorFilter, setDoctorFilter] = useState<string>("all")
  const [remoteRows, setRemoteRows] = useState<ProctoBooking[] | null>(null)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState("")
  const remoteReq = useRef(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [bookOpen, setBookOpen] = useState(false)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [chatBooking, setChatBooking] = useState<ProctoBooking | null>(null)
  const [canChangeStatus, setCanChangeStatus] = useState(true)
  const [canCreateAppointment, setCanCreateAppointment] = useState(true)

  useEffect(() => {
    let alive = true
    if (!practiceId) return
    void proctoService.getMyPracticePermissions(practiceId).then((res) => {
      if (!alive || res.status !== "successful" || !res.data?.permissions) return
      const p = res.data.permissions
      setCanChangeStatus(Boolean(p.CHANGE_BOOKING_STATUS))
      setCanCreateAppointment(Boolean(p.CREATE_APPOINTMENT))
    })
    return () => {
      alive = false
    }
  }, [practiceId])

  const isClinic = portal === "clinic"

  const { range, rangeError } = useMemo((): {
    range: IsoRange | null
    rangeError: string | null
  } => {
    if (rangePreset !== "custom") {
      return { range: resolvePresetRange(rangePreset), rangeError: null }
    }
    const { from, to } = customRange
    if (!from || !to) {
      return { range: null, rangeError: "Pick both From and To dates." }
    }
    if (from > to) {
      return {
        range: null,
        rangeError: "From date must be on or before the To date.",
      }
    }
    if (daysBetween(from, to) >= MAX_CUSTOM_RANGE_DAYS) {
      return {
        range: null,
        rangeError: `Pick a range of up to ${MAX_CUSTOM_RANGE_DAYS} days.`,
      }
    }
    return { range: { from, to }, rangeError: null }
  }, [rangePreset, customRange])

  const rangeFrom = range?.from ?? null
  const rangeTo = range?.to ?? null
  const providerId = isClinic && doctorFilter !== "all" ? doctorFilter : null

  const loadRows = useCallback(async () => {
    const req = ++remoteReq.current
    if (!rangeFrom || !rangeTo || !practiceId) {
      setRemoteRows(null)
      setRemoteLoading(false)
      setRemoteError("")
      return
    }
    setRemoteLoading(true)
    setRemoteError("")
    const res = await proctoService.listPracticeBookings(practiceId, {
      from: rangeFrom,
      to: rangeTo,
      ...(providerId ? { providerId } : {}),
    })
    if (req !== remoteReq.current) return
    setRemoteLoading(false)
    if (res.status === "successful" && Array.isArray(res.data)) {
      setRemoteRows(sortBookingsByWhen(res.data as ProctoBooking[], "asc"))
    } else {
      setRemoteRows([])
      setRemoteError(
        res.message || "Could not load appointments for this date range.",
      )
    }
  }, [rangeFrom, rangeTo, providerId, practiceId])

  useEffect(() => {
    setRemoteRows(null)
    void loadRows()
  }, [loadRows])

  // New WhatsApp / web bookings arrive as socket events — re-fetch the range
  // from the backend (rows stay on screen while it loads).
  const lastTick = useRef(bookingTick)
  useEffect(() => {
    if (bookingTick === lastTick.current) return
    lastTick.current = bookingTick
    const t = setTimeout(() => void loadRows(), 700)
    return () => clearTimeout(t)
  }, [bookingTick, loadRows])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadRows()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [loadRows])

  useEffect(() => {
    if (liveConnected) return
    const id = setInterval(() => void loadRows(), 60_000)
    return () => clearInterval(id)
  }, [liveConnected, loadRows])

  const rangeRows = remoteRows ?? []

  const upcomingAfterToday = useMemo(() => {
    if (rangePreset !== "today") return 0
    const today = practiceTodayIso()
    return cachedBookings.filter((b) => {
      const d = bookingDateIso(b)
      if (!d || d <= today) return false
      if (providerId && bookingProviderId(b) !== providerId) return false
      const s = String(b.status || "").toUpperCase()
      return s !== "CANCELED" && s !== "CANCELLED" && s !== "COMPLETED" && s !== "NO_SHOW"
    }).length
  }, [rangePreset, cachedBookings, providerId])

  const doctorOptions = useMemo(() => {
    if (!isClinic) return []
    const byId = new Map<string, string>()
    for (const m of memberships[0]?.practice?.members ?? []) {
      if (
        m.userId &&
        m.isActive !== false &&
        isPracticingDoctor(m)
      ) {
        byId.set(
          m.userId,
          m.user?.name?.trim() || m.user?.email?.trim() || "Doctor",
        )
      }
    }
    for (const b of rangeRows) {
      const id = bookingProviderId(b)
      if (id && !byId.has(id)) {
        byId.set(id, b.provider?.name?.trim() || "Doctor")
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [isClinic, memberships, rangeRows])

  const doctorRows = rangeRows

  const showLoading =
    (!ready && loading) || (remoteLoading && remoteRows === null)

  const rangeLabel =
    rangePreset === "custom"
      ? range
        ? formatIsoRange(range)
        : "the selected dates"
      : (APPOINTMENT_RANGE_PRESETS.find((p) => p.key === rangePreset)?.label ??
        "").toLowerCase()

  async function onStatus(id: string, status: string, reason?: string) {
    const previous = rangeRows.find((b) => b.id === id)?.status
    if (isTerminalVisitStatus(previous || "")) {
      setActionError("Completed appointments cannot change status.")
      return
    }
    const patchRemote = (next: string) =>
      setRemoteRows((prev) =>
        prev ? prev.map((b) => (b.id === id ? { ...b, status: next } : b)) : prev,
      )
    setBusyId(id)
    setActionError("")
    patchBooking(id, { status })
    patchRemote(status)
    const res = await proctoService.updateBookingStatus(id, status, reason)
    setBusyId(null)
    if (res.status !== "successful") {
      if (previous) {
        patchBooking(id, { status: previous })
        patchRemote(previous)
      }
      setActionError(res.message || "Could not update status")
      return
    }
    const arrivedAt = (res.data as { arrivedAt?: string | null } | undefined)
      ?.arrivedAt
    if (arrivedAt !== undefined) {
      patchBooking(id, { arrivedAt })
      setRemoteRows((prev) =>
        prev ? prev.map((b) => (b.id === id ? { ...b, arrivedAt } : b)) : prev,
      )
    }
  }

  async function onComplaint(id: string, disease: string) {
    const row = rangeRows.find((b) => b.id === id)
    const previous = row?.disease ?? null
    const next = disease.trim()
    if (!next) {
      setActionError("Chief complaint is required.")
      return
    }
    if ((previous?.trim() || "") === next) return
    const patchRemote = (value: string | null) =>
      setRemoteRows((prev) =>
        prev ? prev.map((b) => (b.id === id ? { ...b, disease: value } : b)) : prev,
      )
    setBusyId(id)
    setActionError("")
    patchBooking(id, { disease: next })
    patchRemote(next)
    const res = await proctoService.updateBookingVisit(id, { disease: next })
    setBusyId(null)
    if (res.status !== "successful") {
      patchBooking(id, { disease: previous })
      patchRemote(previous)
      setActionError(res.message || "Could not save the chief complaint")
    }
  }

  function onPaymentUpdate(
    id: string,
    patch: {
      paymentStatus: string | null
      paymentAmount: number | null
      paidAt: string | null
    },
  ) {
    patchBooking(id, patch)
    setRemoteRows((prev) =>
      prev ? prev.map((b) => (b.id === id ? { ...b, ...patch } : b)) : prev,
    )
  }

  const filtered = useMemo(
    () =>
      doctorRows.filter((b) =>
        matchesQueueStatusFilter(b.status || "", statusFilter),
      ),
    [doctorRows, statusFilter],
  )
  const listPagination = useClientPagination(filtered, {
    resetKey: statusFilter,
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardPageHeader
        className="shrink-0"
        compact
        eyebrow={isClinic ? "Clinic" : "Doctor"}
        title="Appointments"
        subtitle={
          practiceName
            ? isClinic
              ? `Visits for all doctors at ${practiceName} — book for any doctor or update patient status.`
              : `Visits for ${practiceName}.`
            : isClinic
              ? "Visits for all your doctors — book or update patient status."
              : "Your visits."
        }
        action={
          canCreateAppointment ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
              onClick={() => setWalkInOpen(true)}
            >
              <Siren className="size-4" aria-hidden />
              Emergency walk-in
            </button>
            <button
              type="button"
              className="dashboard-btn-primary"
              onClick={() => setBookOpen(true)}
            >
              Book appointment
            </button>
          </div>
          ) : null
        }
      />

      <ClinicBookAppointmentModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        onBooked={() => {
          void refresh({ silent: true })
          void loadRows()
        }}
      />
      <EmergencyWalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onAdded={() => {
          void refresh({ silent: true })
          if (rangePreset === "today") void loadRows()
          else setRangePreset("today")
        }}
      />

      {actionError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}

      {loadError && !practiceId ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {loadError}
        </p>
      ) : null}

      {remoteError ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {remoteError}
        </p>
      ) : null}

      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
        <AppointmentDateRangeFilter
          className="min-w-0 basis-full"
          preset={rangePreset}
          onPresetChange={setRangePreset}
          custom={customRange}
          onCustomChange={setCustomRange}
          range={range}
          error={rangeError}
        />
        {isClinic && doctorOptions.length > 1 ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            Doctor
            <select
              className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
            >
              <option value="all">All doctors</option>
              {doctorOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => void loadRows()}
          disabled={remoteLoading || !range}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <RefreshCw
            className={`size-3.5 ${remoteLoading ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </button>
      </div>

      <BookingStatusFilterBar
        value={statusFilter}
        onChange={setStatusFilter}
        statuses={doctorRows.map((b) => b.status)}
        className="mt-3"
      />

      {upcomingAfterToday > 0 ? (
        <p className="mt-3 text-sm text-neutral-700 dark:text-slate-300">
          {upcomingAfterToday} more upcoming appointment
          {upcomingAfterToday === 1 ? "" : "s"} after today.{" "}
          <button
            type="button"
            onClick={() => setRangePreset("upcoming")}
            className="font-semibold text-[var(--theme-primary)] hover:underline"
          >
            View upcoming
          </button>
        </p>
      ) : null}

      {showLoading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      ) : rangeError ? null : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No appointments for {rangeLabel} in this filter.{" "}
          {canCreateAppointment ? (
            <button
              type="button"
              className="font-semibold text-[var(--theme-primary)] hover:underline"
              onClick={() => setBookOpen(true)}
            >
              Book one now
            </button>
          ) : null}
        </p>
      ) : (
        <>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
            {listPagination.pageItems.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border border-neutral-300 bg-white p-4 dark:border-neutral-600 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <PatientNameHover
                      booking={b}
                      className="truncate font-semibold text-neutral-900 dark:text-white"
                    />
                    <p className="text-xs text-neutral-500">
                      {[
                        b.patient?.mrn?.trim()
                          ? `MRN ${b.patient.mrn.trim()}`
                          : null,
                        formatPhoneDisplay(
                          b.patientPhone || b.patient_phone,
                          "",
                        ) || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  {formatBookingWhenDetailed(b)}
                  {isEmergencyWalkIn(b) ? <EmergencyWalkInBadge /> : null}
                </p>
                {formatArrival(b) ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    Arrived: {formatArrival(b)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-neutral-500">
                  Doctor: {bookingDoctorName(b)}
                </p>
                <label className="mt-2 block text-xs text-neutral-500">
                  Chief complaint
                  <ChiefComplaintField
                    value={chiefComplaintOf(b)}
                    busy={busyId === b.id}
                    onSave={(disease) => void onComplaint(b.id, disease)}
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BookingStatusControls
                    status={b.status || "SCHEDULED"}
                    busy={busyId === b.id}
                    compact
                    showActionButtons={false}
                    allowChange={canChangeStatus}
                    ariaLabel={`Update status for ${b.patientName || "patient"}`}
                    onChange={(status, reason) => void onStatus(b.id, status, reason)}
                  />
                  <ChatIconButton
                    enabled={Boolean(bookingPeerUserId(b))}
                    patientName={b.patientName || b.patient?.name}
                    onOpen={() => setChatBooking(b)}
                  />
                  <PrescriptionActionsMenu
                    bookingId={b.id}
                    compact
                    enabled={
                      String(b.status || "").toUpperCase() === "COMPLETED"
                    }
                  />
                  <PaymentStatusButton
                    bookingId={b.id}
                    status={b.paymentStatus ?? b.payment_status}
                    amount={b.paymentAmount ?? b.payment_amount}
                    patientName={b.patientName || b.patient?.name}
                    patientPhone={b.patientPhone}
                    compact
                    onUpdate={(patch) => onPaymentUpdate(b.id, patch)}
                  />
                </div>
                <Link
                  href={`/doctor/queue/${b.id}`}
                  className="mt-2 inline-block text-xs font-bold text-[var(--theme-primary)] hover:underline"
                >
                  Open visit →
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 hidden min-h-0 w-full flex-1 overflow-auto rounded-2xl border border-neutral-300 bg-white dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] md:block">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-[var(--solune-elevated)] dark:text-neutral-300">
                <tr>
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">MRN</th>
                  <th className="px-3 py-2">Doctor</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Arrival</th>
                  <th className="min-w-[180px] px-3 py-2">Chief complaint</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Chat</th>
                  <th className="px-3 py-2">Rx</th>
                  <th className="px-3 py-2 text-right">Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {listPagination.pageItems.map((b) => {
                  const when = bookingWhenParts(b)
                  const arrived = formatArrival(b)
                  return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-semibold">
                      <PatientNameHover booking={b} />
                      <p className="text-[11px] font-medium opacity-60">
                        {formatPhoneDisplay(
                          b.patientPhone || b.patient_phone,
                          "",
                        )}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold tabular-nums">
                      {b.patient?.mrn?.trim() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold">
                      {bookingDoctorName(b)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold">
                      <div>{when.day}</div>
                      <div className="text-[11px] font-medium opacity-70">
                        {when.time}
                      </div>
                      {isEmergencyWalkIn(b) ? (
                        <div className="mt-0.5">
                          <EmergencyWalkInBadge />
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold tabular-nums">
                      {arrived || (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ChiefComplaintField
                        value={chiefComplaintOf(b)}
                        busy={busyId === b.id}
                        onSave={(disease) => void onComplaint(b.id, disease)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <BookingStatusControls
                        status={b.status || "SCHEDULED"}
                        busy={busyId === b.id}
                        compact
                        showActionButtons={false}
                        allowChange={canChangeStatus}
                        ariaLabel={`Update status for ${b.patientName || "patient"}`}
                        onChange={(status, reason) => void onStatus(b.id, status, reason)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PaymentStatusButton
                        bookingId={b.id}
                        status={b.paymentStatus ?? b.payment_status}
                        amount={b.paymentAmount ?? b.payment_amount}
                        patientName={b.patientName || b.patient?.name}
                        patientPhone={b.patientPhone}
                        compact
                        onUpdate={(patch) => onPaymentUpdate(b.id, patch)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <ChatIconButton
                        enabled={Boolean(bookingPeerUserId(b))}
                        patientName={b.patientName || b.patient?.name}
                        onOpen={() => setChatBooking(b)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PrescriptionActionsMenu
                        bookingId={b.id}
                        compact
                        enabled={
                          String(b.status || "").toUpperCase() === "COMPLETED"
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="text-xs font-bold text-[var(--theme-primary)] hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            pagination={listPagination}
            label="appointments"
            className="mt-2 shrink-0 border-t border-neutral-200 px-1 dark:border-neutral-700"
          />
        </>
      )}

      <AppointmentChatModal
        open={Boolean(chatBooking)}
        patientName={
          chatBooking?.patientName || chatBooking?.patient?.name || null
        }
        peerUserId={chatBooking ? bookingPeerUserId(chatBooking) : null}
        bookingId={chatBooking?.id ?? null}
        onClose={() => setChatBooking(null)}
      />
    </div>
  )
}
