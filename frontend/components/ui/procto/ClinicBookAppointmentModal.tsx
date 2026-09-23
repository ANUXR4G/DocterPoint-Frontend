"use client"

import { useEffect, useMemo, useState } from "react"
import PopupModal from "@/components/modals/Modal"
import { proctoService } from "@/lib/services/procto"
import {
  usePracticeDashboard,
  type PracticeMembership,
} from "@/contexts/PracticeDashboardContext"

type Props = {
  open: boolean
  onClose: () => void
  onBooked: () => void
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

function toDateInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function doctorsFromMembership(m: PracticeMembership | undefined) {
  const members = m?.practice?.members ?? []
  return members
    .filter(
      (row) =>
        row.isActive !== false &&
        (row.role === "DOCTOR" ||
          row.role === "PRACTICE_OWNER" ||
          row.role === "PRACTICE_ADMIN") &&
        Boolean(row.userId),
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
  const [date, setDate] = useState(() => toDateInputValue(new Date()))
  const [mode, setMode] = useState<"TIME_BASED" | "TOKEN_BASED">("TIME_BASED")
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [disease, setDisease] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    setMessage("")
    setSelectedSlot(null)
    setDisease("")
    if (!providerId && doctors[0]) setProviderId(doctors[0].id)
    if (!locationId && locations[0]) setLocationId(locations[0].id)
  }, [open, doctors, locations, providerId, locationId])

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
    () => (availability?.timeSlots || []).filter((s) => s.available),
    [availability],
  )
  const tokenSession = availability?.tokenSessions?.[0]

  async function submit() {
    if (!practiceId || !providerId || !locationId) {
      setMessage("Select doctor and location.")
      return
    }
    const phone = patientPhone.replace(/\D/g, "")
    if (phone.length < 10) {
      setMessage("Enter a valid patient mobile number.")
      return
    }
    if (!patientName.trim()) {
      setMessage("Enter the patient name.")
      return
    }
    if (!disease.trim()) {
      setMessage("Enter the reason for visit.")
      return
    }
    if (mode === "TIME_BASED" && !selectedSlot) {
      setMessage("Select an available time slot.")
      return
    }
    if (mode === "TOKEN_BASED" && !tokenSession?.available) {
      setMessage("No token session available for this date.")
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
      patientPhone: phone.slice(-10),
      patientName: patientName.trim(),
      disease: disease.trim(),
    }
    if (mode === "TIME_BASED" && selectedSlot) body.slotStart = selectedSlot
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

  const fieldClass =
    "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

  return (
    <PopupModal
      open={open}
      handler={onClose}
      title="Book appointment"
      direction="center"
      className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
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
          disabled={submitting || !practiceId}
        >
          {submitting ? "Booking…" : "Confirm booking"}
        </button>
      }
    >
      <div className="space-y-3 px-4 pb-2 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">
          Manual booking for{" "}
          <span className="font-semibold text-neutral-900 dark:text-white">
            {practiceName || "this clinic"}
          </span>
          . Choose a doctor, slot, and patient details.
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
            min={toDateInputValue(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

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
            {openSlots.length === 0 ? (
              <p className="mt-1 text-neutral-500">
                No open slots on this date.
              </p>
            ) : (
              <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {openSlots.map((s) => {
                  const label = new Date(s.start).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                  const active = selectedSlot === s.start
                  return (
                    <button
                      key={s.start}
                      type="button"
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
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
        ) : (
          <p className="rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700">
            {tokenSession?.available
              ? `Token #${tokenSession.nextToken} available`
              : "No token session for this date"}
          </p>
        )}

        <label className="block">
          <span className="font-semibold">Patient name</span>
          <input
            className={fieldClass}
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="font-semibold">Patient mobile</span>
          <input
            className={fieldClass}
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>

        <label className="block">
          <span className="font-semibold">Reason for visit</span>
          <textarea
            className={fieldClass}
            rows={2}
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
            placeholder="e.g. Fever, follow-up"
          />
        </label>

        {message ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </PopupModal>
  )
}
