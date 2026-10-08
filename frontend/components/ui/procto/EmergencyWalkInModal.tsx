"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { proctoService, type DeskPatient } from "@/lib/services/procto"
import DeskPatientPicker, {
  deskFieldClass,
  deskLabelClass,
  LookupStatus,
} from "@/components/ui/procto/DeskPatientPicker"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { dashboardPortalRoot } from "@/lib/portalRoot"

type Props = {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

const DOCTOR_ROLES = new Set(["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"])

function Step({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        done
          ? "bg-emerald-500 text-white"
          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      }`}
      aria-hidden
    >
      {done ? "✓" : n}
    </span>
  )
}

export default function EmergencyWalkInModal({
  open,
  onClose,
  onAdded,
}: Props) {
  const { memberships, practiceId, practiceName, ready } = usePracticeDashboard()
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
  const [patientBusy, setPatientBusy] = useState({
    searching: false,
    loadingRecord: false,
  })
  const [message, setMessage] = useState("")
  const recordWait = !ready || patientBusy.loadingRecord || submitting

  useEffect(() => {
    if (!open) return
    setMessage("")
    setPatient(null)
    setPatientBusy({ searching: false, loadingRecord: false })
    setDisease("")
    setProviderId((prev) => {
      if (prev && doctors.some((d) => d.id === prev)) return prev
      return doctors.find((d) => d.id === myUserId)?.id || doctors[0]?.id || ""
    })
  }, [open, doctors, myUserId])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !recordWait) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, recordWait, onClose])

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
    let res: Awaited<ReturnType<typeof proctoService.createWalkIn>>
    try {
      res = await proctoService.createWalkIn({
        practiceId,
        providerId,
        patientId: patient.patientId,
        patientPhone: patient.phone,
        ...(disease.trim() ? { disease: disease.trim() } : {}),
      })
    } catch {
      setMessage("Could not add the walk-in. Try again.")
      return
    } finally {
      setSubmitting(false)
    }
    if (res.status === "successful") {
      onAdded()
      onClose()
      return
    }
    setMessage(res.message || "Could not add the walk-in.")
  }

  if (!open || typeof document === "undefined") return null

  const doctorName =
    doctors.find((d) => d.id === providerId)?.name || doctors[0]?.name || ""

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walk-in-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !recordWait) onClose()
      }}
    >
      <div className="flex max-h-[96dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:rounded-3xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-900">
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v3M4.2 6.2l2.1 2.1M19.8 6.2l-2.1 2.1M6 17v-4a6 6 0 0 1 12 0v4" />
              <path d="M4 17h16v3H4z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="walk-in-title"
              className="text-lg font-bold leading-tight text-slate-900 dark:text-white"
            >
              Emergency walk-in
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Goes straight into today&apos;s waiting list at{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {practiceName || "the clinic"}
              </span>{" "}
              — no time slot needed, even if the schedule is full.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={recordWait}
            aria-label="Close"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          className={`relative min-h-0 flex-1 overflow-y-auto ${recordWait ? "min-h-52" : ""}`}
        >
        <div className="space-y-5 px-5 py-5 text-sm">
          {!ready ? null : !doctors.length ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              No doctors on the roster yet. Add doctors under Clinic → Doctors.
            </p>
          ) : doctors.length === 1 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                Dr
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Doctor
                </p>
                <p className="truncate font-semibold text-slate-900 dark:text-white">
                  {doctorName}
                </p>
              </div>
            </div>
          ) : (
            <label className="block">
              <span className={deskLabelClass}>Doctor</span>
              <select
                className={deskFieldClass}
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

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Step n={1} done={Boolean(patient)} />
              <span className="font-semibold text-slate-900 dark:text-white">
                Patient
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                — every walk-in needs a Patient ID (MRN)
              </span>
            </div>
            {practiceId ? (
              <DeskPatientPicker
                practiceId={practiceId}
                value={patient}
                onChange={setPatient}
                autoFocus
                onBusyChange={setPatientBusy}
              />
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Step n={2} done={Boolean(disease.trim())} />
              <span className="font-semibold text-slate-900 dark:text-white">
                Chief complaint
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                optional
              </span>
            </div>
            <textarea
              className={`${deskFieldClass} !mt-0 resize-none`}
              rows={2}
              value={disease}
              onChange={(e) => setDisease(e.target.value)}
              placeholder="e.g. chest pain, high fever"
            />
          </section>

          {message ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {message}
            </p>
          ) : null}
        </div>
        {recordWait ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 px-6 backdrop-blur-[2px] dark:bg-slate-900/85">
            <LookupStatus
              label={
                submitting
                  ? "Adding to the waiting list…"
                  : !ready
                    ? "Loading clinic details…"
                    : "Loading this patient’s details…"
              }
              detail="This can take a few seconds. Stay on this screen until it finishes."
            />
          </div>
        ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/80">
          <button
            type="button"
            className="h-11 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={onClose}
            disabled={recordWait}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            onClick={() => void submit()}
            disabled={
              recordWait ||
              patientBusy.searching ||
              !practiceId ||
              !doctors.length ||
              !patient
            }
          >
            {submitting ? (
              <>
                <span
                  className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Adding to waiting list…
              </>
            ) : (
              "Add to waiting list"
            )}
          </button>
        </div>
      </div>
    </div>,
    dashboardPortalRoot(),
  )
}
