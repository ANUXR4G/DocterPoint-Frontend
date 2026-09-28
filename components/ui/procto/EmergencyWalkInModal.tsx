"use client"

import { useEffect, useMemo, useState } from "react"
import PopupModal from "@/components/modals/Modal"
import { proctoService, type DeskPatient } from "@/lib/services/procto"
import DeskPatientPicker from "@/components/ui/procto/DeskPatientPicker"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"

type Props = {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

const DOCTOR_ROLES = new Set(["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"])

export default function EmergencyWalkInModal({
  open,
  onClose,
  onAdded,
}: Props) {
  const { memberships, practiceId, practiceName } = usePracticeDashboard()
  const membership = memberships[0]
  const myUserId = membership?.userId || ""
  const onlySelf = membership?.role === "DOCTOR"

  const doctors = useMemo(() => {
    const rows = (membership?.practice?.members ?? [])
      .filter(
        (row) =>
          row.isActive !== false &&
          DOCTOR_ROLES.has(row.role) &&
          Boolean(row.userId) &&
          (!onlySelf || row.userId === myUserId),
      )
      .map((row) => ({
        id: String(row.userId),
        name: row.user?.name || row.user?.email || "Doctor",
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return rows
  }, [membership, onlySelf, myUserId])

  const [providerId, setProviderId] = useState("")
  const [patient, setPatient] = useState<DeskPatient | null>(null)
  const [disease, setDisease] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    setMessage("")
    setPatient(null)
    setDisease("")
    setProviderId((prev) => {
      if (prev && doctors.some((d) => d.id === prev)) return prev
      return doctors.find((d) => d.id === myUserId)?.id || doctors[0]?.id || ""
    })
  }, [open, doctors, myUserId])

  async function submit() {
    if (!practiceId || !providerId) {
      setMessage("Select the doctor.")
      return
    }
    if (!patient) {
      setMessage("Find the patient or register them first.")
      return
    }
    setSubmitting(true)
    setMessage("")
    const res = await proctoService.createWalkIn({
      practiceId,
      providerId,
      patientId: patient.patientId,
      patientPhone: patient.phone,
      ...(disease.trim() ? { disease: disease.trim() } : {}),
    })
    setSubmitting(false)
    if (res.status === "successful") {
      onAdded()
      onClose()
      return
    }
    setMessage(res.message || "Could not add the walk-in.")
  }

  const fieldClass =
    "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

  return (
    <PopupModal
      open={open}
      handler={onClose}
      title="Emergency walk-in"
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
          className="dashboard-btn-primary !bg-red-600 hover:!bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void submit()}
          disabled={submitting || !practiceId || !doctors.length || !patient}
        >
          {submitting ? "Adding…" : "Add to waiting list"}
        </button>
      }
    >
      <div className="space-y-3 px-4 pb-2 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">
          Patient is at{" "}
          <span className="font-semibold text-neutral-900 dark:text-white">
            {practiceName || "the clinic"}
          </span>{" "}
          now. No time slot needed — they go straight into today&apos;s waiting
          list, even if the schedule is full.
        </p>

        {!doctors.length ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            No doctors on the roster yet. Add doctors under Clinic → Doctors.
          </p>
        ) : doctors.length === 1 ? (
          <p>
            <span className="font-semibold">Doctor: </span>
            {doctors[0].name}
          </p>
        ) : (
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
        )}

        {open && practiceId ? (
          <DeskPatientPicker
            practiceId={practiceId}
            value={patient}
            onChange={setPatient}
            autoFocus
          />
        ) : null}

        <label className="block">
          <span className="font-semibold">Chief complaint (optional)</span>
          <textarea
            className={fieldClass}
            rows={2}
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
            placeholder="e.g. chest pain, high fever"
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
