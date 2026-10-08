"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { MessageCircle, RefreshCw, Siren } from "lucide-react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
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
import ChiefComplaintCell from "@/components/ui/procto/ChiefComplaintCell"
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
import { practiceTodayIso } from "@/lib/practiceTime"
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
      onClick={onOpen}
      className={`inline-flex size-9 items-center justify-center rounded-xl border transition ${
        enabled
          ? "border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/20"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-500 dark:hover:bg-neutral-800"
      }`}
    >
      <MessageCircle className="size-4" aria-hidden />
    </button>
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

  return (
    <>
      <DashboardPageHeader
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

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <AppointmentDateRangeFilter
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
          <button
            type="button"
            className="font-semibold text-[var(--theme-primary)] hover:underline"
            onClick={() => setBookOpen(true)}
          >
            Book one now
          </button>
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2 md:hidden">
            {filtered.map((b) => (
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
                {chiefComplaintOf(b) ? (
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-700 dark:text-slate-300">
                    <span className="opacity-60">Chief complaint: </span>
                    {chiefComplaintOf(b)}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <BookingStatusControls
                    status={b.status || "SCHEDULED"}
                    busy={busyId === b.id}
                    compact
                    showActionButtons={false}
                    ariaLabel={`Update status for ${b.patientName || "patient"}`}
                    visitHref={`/doctor/queue/${b.id}`}
                    onChange={(status, reason) => void onStatus(b.id, status, reason)}
                  />
                  <ChatIconButton
                    enabled={Boolean(bookingPeerUserId(b))}
                    patientName={b.patientName || b.patient?.name}
                    onOpen={() => setChatBooking(b)}
                  />
                  <PrescriptionActionsMenu
                    bookingId={b.id}
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

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-neutral-300 bg-white dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] md:block">
            <table className="w-full min-w-[1020px] text-left text-sm">
              <thead className="bg-neutral-100 text-xs font-bold uppercase tracking-wide text-neutral-600 dark:bg-[var(--solune-elevated)] dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">MRN</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Arrival</th>
                  <th className="min-w-[180px] px-4 py-3">Chief complaint</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Chat</th>
                  <th className="px-4 py-3">Rx</th>
                  <th className="px-4 py-3 text-right">Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-semibold">
                      <PatientNameHover booking={b} />
                      <p className="text-xs font-medium opacity-60">
                        {formatPhoneDisplay(
                          b.patientPhone || b.patient_phone,
                          "",
                        )}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums tracking-wide">
                      {b.patient?.mrn?.trim() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                      {bookingDoctorName(b)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                      {formatBookingWhenDetailed(b)}
                      {isEmergencyWalkIn(b) ? (
                        <div className="mt-1">
                          <EmergencyWalkInBadge />
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold tabular-nums">
                      {formatArrival(b) || (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChiefComplaintCell text={chiefComplaintOf(b)} />
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusControls
                        status={b.status || "SCHEDULED"}
                        busy={busyId === b.id}
                        compact
                        showActionButtons={false}
                        ariaLabel={`Update status for ${b.patientName || "patient"}`}
                        visitHref={`/doctor/queue/${b.id}`}
                    onChange={(status, reason) => void onStatus(b.id, status, reason)}
                      />
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <ChatIconButton
                        enabled={Boolean(bookingPeerUserId(b))}
                        patientName={b.patientName || b.patient?.name}
                        onOpen={() => setChatBooking(b)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <PrescriptionActionsMenu
                        bookingId={b.id}
                        enabled={
                          String(b.status || "").toUpperCase() === "COMPLETED"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/doctor/queue/${b.id}`}
                        className="text-xs font-bold text-[var(--theme-primary)] hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
  )
}
