"use client"

import { useEffect, useMemo, useState } from "react"
import PopupModal from "@/components/modals/Modal"
import { proctoService, type DeskPatient } from "@/lib/services/procto"
import DeskPatientPicker from "@/components/ui/procto/DeskPatientPicker"
import { isPracticingDoctor } from "@/lib/rosterDoctor"
import {
  formatPracticeTime,
  practiceMinutesOfDay,
  practiceSlotStartIso,
  practiceTodayIso,
} from "@/lib/practiceTime"
import { toHm } from "@/lib/quickSlots"
import {
  usePracticeDashboard,
  type PracticeMembership,
} from "@/contexts/PracticeDashboardContext"

export type ClinicBookPrefill = {
  providerId?: string
  date?: string
  /** Minutes from midnight in practice timezone (calendar click). */
  startMinutes?: number
  /** End of a dragged or shift-clicked block. One slot when omitted. */
  endMinutes?: number
}

type Props = {
  open: boolean
  onClose: () => void
  onBooked: () => void
  prefill?: ClinicBookPrefill | null
}

type Availability = {
  timeSlots?: Array<{
    start: string
    end: string
    available: boolean
  }>
  tokenSessions?: Array<{
    sessionStart: string
    sessionEnd: string
    nextToken: number
    available: boolean
  }>
  configuredMode?: "TIME_BASED" | "TOKEN_BASED" | null
  configuredModes?: string[]
}

type Intent = "book" | "block"

const BLOCK_REASON_CHIPS = [
  "Meeting",
  "Lunch break",
  "Personal",
  "Admin work",
  "Procedure",
  "Emergency",
] as const

function isFutureSlotStart(start: string): boolean {
  const t = new Date(start).getTime()
  return Number.isFinite(t) && t > Date.now()
}

function doctorsFromMembership(m: PracticeMembership | undefined) {
  const members = m?.practice?.members ?? []
  return members
    .filter(
      (row) =>
        row.isActive !== false &&
        isPracticingDoctor(row) && Boolean(row.userId),
    )
    .map((row) => ({
      id: String(row.userId),
      name: row.user?.name || row.user?.email || "Doctor",
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function locationsFromMembership(m: PracticeMembership | undefined) {
  const locs =
    (
      m?.practice as {
        locations?: Array<{
          id: string
          name?: string
          city?: string
          address?: string
          isActive?: boolean
        }>
      }
    )?.locations ?? []
  return locs
    .filter((l) => l.isActive !== false)
    .map((l) => ({
      id: l.id,
      name: l.name || l.city || "Location",
      city: l.city || "",
    }))
}

export default function ClinicBookAppointmentModal({
  open,
  onClose,
  onBooked,
  prefill = null,
}: Props) {
  const { memberships, practiceId, practiceName } = usePracticeDashboard()
  const membership = memberships[0]
  const doctors = useMemo(
    () => doctorsFromMembership(membership),
    [membership],
  )
  const locations = useMemo(
    () => locationsFromMembership(membership),
    [membership],
  )

  const [providerId, setProviderId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [date, setDate] = useState(() => practiceTodayIso())
  const [mode, setMode] = useState<"TIME_BASED" | "TOKEN_BASED">("TIME_BASED")
  const [intent, setIntent] = useState<Intent>("book")
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [patient, setPatient] = useState<DeskPatient | null>(null)
  const [disease, setDisease] = useState("")
  const [blockReason, setBlockReason] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    setMessage("")
    setSelectedSlot(null)
    setDisease("")
    setBlockReason("")
    setPatient(null)
    setIntent("book")
    const prefDoc =
      prefill?.providerId &&
      doctors.some((d) => d.id === prefill.providerId)
        ? prefill.providerId
        : doctors[0]?.id || ""
    setProviderId(prefDoc)
    setLocationId(locations[0]?.id || "")
    setDate(prefill?.date || practiceTodayIso())
  }, [open, doctors, locations, prefill])

  useEffect(() => {
    if (!open || !practiceId || !providerId || !locationId || !date) {
      setAvailability(null)
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    setSelectedSlot(null)
    setMessage("")
    void proctoService
      .getAvailability({ practiceId, providerId, locationId, date })
      .then((res) => {
        if (cancelled) return
        setLoadingSlots(false)
        if (res.status !== "successful") {
          setAvailability(null)
          setMessage(res.message || "Could not load availability.")
          return
        }
        const data = (res.data || {}) as Availability
        setAvailability(data)
        const modes = data.configuredModes?.length
          ? data.configuredModes
          : data.configuredMode
            ? [data.configuredMode]
            : []
        if (modes.includes("TOKEN_BASED") && !modes.includes("TIME_BASED")) {
          setMode("TOKEN_BASED")
        } else if (modes.includes("TIME_BASED")) {
          setMode("TIME_BASED")
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoadingSlots(false)
        setAvailability(null)
        setMessage("Could not load availability.")
      })
    return () => {
      cancelled = true
    }
  }, [open, practiceId, providerId, locationId, date])

  const openSlots = useMemo(
    () =>
      (availability?.timeSlots || []).filter(
        (s) => s.available && isFutureSlotStart(s.start),
      ),
    [availability],
  )
  const tokenSession = availability?.tokenSessions?.[0]

  useEffect(() => {
    if (!open || mode !== "TIME_BASED") return
    if (prefill?.startMinutes == null || !openSlots.length) return
    const hit = openSlots.find(
      (s) => practiceMinutesOfDay(s.start) === prefill.startMinutes,
    )
    if (hit) setSelectedSlot(hit.start)
  }, [open, mode, openSlots, prefill?.startMinutes])

  const blockMinutes = useMemo(() => {
    if (
      prefill?.startMinutes == null ||
      prefill.endMinutes == null ||
      prefill.endMinutes <= prefill.startMinutes ||
      !selectedSlot
    ) {
      return 0
    }
    if (practiceMinutesOfDay(selectedSlot) !== prefill.startMinutes) return 0
    return prefill.endMinutes - prefill.startMinutes
  }, [prefill?.startMinutes, prefill?.endMinutes, selectedSlot])

  const selectedSlotRow = useMemo(
    () => openSlots.find((s) => s.start === selectedSlot) ?? null,
    [openSlots, selectedSlot],
  )

  const blockWindowLabel = useMemo(() => {
    if (mode !== "TIME_BASED" || !selectedSlot) return ""
    const startHm = formatPracticeTime(selectedSlot)
    const endHm =
      blockMinutes > 0 && prefill?.startMinutes != null
        ? toHm(prefill.startMinutes + blockMinutes)
        : selectedSlotRow
          ? formatPracticeTime(selectedSlotRow.end)
          : ""
    if (!startHm || !endHm) return startHm
    return `${startHm}–${endHm}`
  }, [mode, selectedSlot, selectedSlotRow, blockMinutes, prefill?.startMinutes])

  async function submitBlock() {
    if (!practiceId || !providerId) {
      setMessage("Select a doctor.")
      return
    }
    const reason = blockReason.trim()
    if (!reason) {
      setMessage("Enter a reason for blocking this slot.")
      return
    }
    if (mode === "TIME_BASED") {
      if (!selectedSlot || !selectedSlotRow) {
        setMessage("Select a time slot to block.")
        return
      }
      if (!isFutureSlotStart(selectedSlot)) {
        setMessage("That time has already passed. Pick a later slot.")
        setSelectedSlot(null)
        return
      }
      const startTime = formatPracticeTime(selectedSlot)
      const endTime =
        blockMinutes > 0 && prefill?.startMinutes != null
          ? toHm(prefill.startMinutes + blockMinutes)
          : formatPracticeTime(selectedSlotRow.end)
      if (!startTime || !endTime || startTime >= endTime) {
        setMessage("Could not determine the block window. Pick another slot.")
        return
      }
      setSubmitting(true)
      setMessage("")
      const res = await proctoService.createOverride(practiceId, {
        providerId,
        date,
        type: "BLOCK_SLOT",
        startTime,
        endTime,
        reason,
      })
      setSubmitting(false)
      if (res.status === "successful") {
        onBooked()
        onClose()
        return
      }
      setMessage(res.message || "Could not block this slot.")
      return
    }

    // Token clinics: block the doctor's whole day for this date.
    setSubmitting(true)
    setMessage("")
    const res = await proctoService.createOverride(practiceId, {
      providerId,
      date,
      type: "BLOCK_DAY",
      reason,
    })
    setSubmitting(false)
    if (res.status === "successful") {
      onBooked()
      onClose()
      return
    }
    setMessage(res.message || "Could not block this day.")
  }

  async function submitBooking() {
    if (!practiceId || !providerId || !locationId) {
      setMessage("Select doctor and location.")
      return
    }
    if (!patient) {
      setMessage("Find the patient or register them first.")
      return
    }
    if (mode === "TIME_BASED" && !selectedSlot) {
      setMessage("Select an available time slot.")
      return
    }
    if (
      mode === "TIME_BASED" &&
      selectedSlot &&
      !isFutureSlotStart(selectedSlot)
    ) {
      setMessage("That time has already passed. Pick a later slot.")
      setSelectedSlot(null)
      return
    }
    if (mode === "TOKEN_BASED" && !tokenSession?.available) {
      setMessage("No token session available for this date.")
      return
    }
    if (!disease.trim()) {
      setMessage("Chief complaint is required.")
      return
    }

    setSubmitting(true)
    setMessage("")
    const body: Record<string, unknown> = {
      practiceId,
      locationId,
      providerId,
      mode,
      channel: "PROVIDER_APP",
      patientId: patient.patientId,
      patientPhone: patient.phone,
    }
    if (disease.trim()) body.disease = disease.trim()
    if (mode === "TIME_BASED" && selectedSlot) {
      body.slotStart = selectedSlot
      const span = blockMinutes
      if (span > 0) body.durationMinutes = span
    }
    if (mode === "TOKEN_BASED") body.sessionDate = date

    const res = await proctoService.createBooking(body)
    setSubmitting(false)
    if (res.status === "successful") {
      onBooked()
      onClose()
      return
    }
    setMessage(res.message || "Booking failed. Try another slot.")
  }

  async function submit() {
    if (intent === "block") {
      await submitBlock()
      return
    }
    await submitBooking()
  }

  const fieldClass =
    "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

  const primaryDisabled =
    submitting ||
    !practiceId ||
    (intent === "book"
      ? !patient
      : !blockReason.trim() ||
        (mode === "TIME_BASED" && !selectedSlot))

  return (
    <PopupModal
      open={open}
      handler={onClose}
      title={intent === "block" ? "Block slot" : "Book appointment"}
      direction="center"
      className="!h-auto max-h-[96dvh] w-full max-w-xl overflow-hidden"
      secondaryBtn={
        <button
          type="button"
          className="dashboard-btn-secondary"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
      }
      primaryBtn={
        <button
          type="button"
          className="dashboard-btn-primary"
          onClick={() => void submit()}
          disabled={primaryDisabled}
        >
          {submitting
            ? intent === "block"
              ? "Blocking…"
              : "Booking…"
            : intent === "block"
              ? "Confirm block"
              : "Confirm booking"}
        </button>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2 text-sm">
        <div className="flex gap-2" role="tablist" aria-label="Booking or block">
          <button
            type="button"
            role="tab"
            aria-selected={intent === "book"}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              intent === "book"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
            onClick={() => {
              setIntent("book")
              setMessage("")
            }}
          >
            Book patient
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={intent === "block"}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              intent === "block"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
            onClick={() => {
              setIntent("block")
              setMessage("")
            }}
          >
            Block slot
          </button>
        </div>

        <p className="text-neutral-600 dark:text-neutral-400">
          {intent === "block" ? (
            <>
              Block time for{" "}
              <span className="font-semibold text-neutral-900 dark:text-white">
                {practiceName || "this clinic"}
              </span>
              {mode === "TOKEN_BASED"
                ? ". Token clinics block the doctor's whole day for the selected date."
                : ". Choose a doctor, slot, and reason so patients cannot book it."}
            </>
          ) : (
            <>
              Manual booking for{" "}
              <span className="font-semibold text-neutral-900 dark:text-white">
                {practiceName || "this clinic"}
              </span>
              . Choose a doctor, slot and a registered patient (Patient ID / MRN).
            </>
          )}
        </p>

        {!doctors.length ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            No doctors on the roster yet. Add doctors under Clinic → Doctors.
          </p>
        ) : null}
        {!locations.length ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            No active location configured for this clinic.
          </p>
        ) : null}

        <div
          className={`grid gap-3 ${locations.length > 1 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
        >
          <label className="block">
            <span className="font-semibold">Doctor</span>
            <select
              className={fieldClass}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          {locations.length > 1 ? (
            <label className="block">
              <span className="font-semibold">Location</span>
              <select
                className={fieldClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.city ? ` · ${l.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="font-semibold">Date</span>
            <input
              type="date"
              className={fieldClass}
              value={date}
              min={practiceTodayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {availability?.configuredModes &&
        availability.configuredModes.length > 1 ? (
          <div className="flex gap-2">
            {availability.configuredModes.includes("TIME_BASED") ? (
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  mode === "TIME_BASED"
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "bg-neutral-100 dark:bg-neutral-800"
                }`}
                onClick={() => setMode("TIME_BASED")}
              >
                Time slot
              </button>
            ) : null}
            {availability.configuredModes.includes("TOKEN_BASED") ? (
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  mode === "TOKEN_BASED"
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "bg-neutral-100 dark:bg-neutral-800"
                }`}
                onClick={() => setMode("TOKEN_BASED")}
              >
                Token
              </button>
            ) : null}
          </div>
        ) : null}

        {loadingSlots ? (
          <p className="text-neutral-500">Loading availability…</p>
        ) : mode === "TIME_BASED" ? (
          <div>
            <p className="font-semibold">Time</p>
            {blockMinutes > 0 && prefill?.startMinutes != null ? (
              <p className="mt-1 text-xs font-semibold text-[var(--theme-primary)]">
                {blockMinutes} min ·{" "}
                {formatPracticeTime(practiceSlotStartIso(date, prefill.startMinutes))}
                –
                {formatPracticeTime(
                  practiceSlotStartIso(date, prefill.startMinutes + blockMinutes),
                )}
                {intent === "block"
                  ? ". This window will be blocked."
                  : ". One appointment holds every slot in this block."}
              </p>
            ) : intent === "block" && blockWindowLabel ? (
              <p className="mt-1 text-xs font-semibold text-[var(--theme-primary)]">
                Blocking {blockWindowLabel}. Patients cannot book this window.
              </p>
            ) : null}
            {openSlots.length === 0 ? (
              <p className="mt-1 text-neutral-500">
                No open slots on this date.
              </p>
            ) : (
              <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {openSlots.map((s) => {
                  const label = formatPracticeTime(s.start)
                  const active = selectedSlot === s.start
                  const mins = practiceMinutesOfDay(s.start)
                  const inBlock =
                    blockMinutes > 0 &&
                    prefill?.startMinutes != null &&
                    mins >= prefill.startMinutes &&
                    mins < prefill.startMinutes + blockMinutes
                  return (
                    <button
                      key={s.start}
                      type="button"
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                          : inBlock
                            ? "border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"
                            : "border-neutral-300 dark:border-neutral-600"
                      }`}
                      onClick={() => setSelectedSlot(s.start)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : intent === "block" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Token clinics block the whole day for this doctor on the selected
            date (no new tokens).
          </p>
        ) : (
          <p className="rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700">
            {tokenSession?.available
              ? `Token #${tokenSession.nextToken} available`
              : "No token session for this date"}
          </p>
        )}

        {intent === "book" ? (
          <>
            {open && practiceId ? (
              <DeskPatientPicker
                practiceId={practiceId}
                value={patient}
                onChange={setPatient}
              />
            ) : null}

            <label className="block">
              <span className="font-semibold">Chief complaint *</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={disease}
                onChange={(e) => setDisease(e.target.value)}
                placeholder="e.g. chest pain, high fever"
                required
                aria-required
              />
            </label>
          </>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="font-semibold">Reason for blocking *</span>
              <textarea
                className={fieldClass}
                rows={2}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g. doctor meeting, lunch, personal leave"
                maxLength={200}
                required
                aria-required
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_REASON_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    blockReason === chip
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-neutral-300 dark:border-neutral-600"
                  }`}
                  onClick={() => setBlockReason(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {message ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </PopupModal>
  )
}
