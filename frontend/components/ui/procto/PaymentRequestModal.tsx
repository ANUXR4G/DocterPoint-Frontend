"use client"

import { useEffect, useMemo, useState } from "react"
import PopupModal from "@/components/modals/Modal"
import {
  proctoService,
  type PaymentRequestRow,
} from "@/lib/services/procto"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { formatPhoneDisplay } from "@/lib/formatPhone"

type PatientOption = {
  key: string
  name: string
  phone: string
  patientId: string | null
  mrn: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSent: (row: PaymentRequestRow) => void
  /** Opened from a visit: patient + doctor come from the booking. */
  booking?: {
    id: string
    patientName?: string | null
    patientPhone?: string | null
  } | null
}

const DOCTOR_ROLES = new Set(["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"])

const EXPIRY_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
]

export default function PaymentRequestModal({
  open,
  onClose,
  onSent,
  booking,
}: Props) {
  const { memberships, practiceId } = usePracticeDashboard()
  const membership = memberships[0]
  const myUserId = membership?.userId || ""
  const isAdmin =
    membership?.role === "PRACTICE_OWNER" || membership?.role === "PRACTICE_ADMIN"

  const doctors = useMemo(
    () =>
      (membership?.practice?.members ?? [])
        .filter(
          (m) => m.isActive !== false && DOCTOR_ROLES.has(m.role) && m.userId,
        )
        .map((m) => ({
          id: String(m.userId),
          name: m.user?.name || m.user?.email || "Doctor",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [membership],
  )

  const [patients, setPatients] = useState<PatientOption[]>([])
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<PatientOption | null>(null)
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [providerId, setProviderId] = useState("")
  const [amount, setAmount] = useState("")
  const [purpose, setPurpose] = useState("")
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    setMessage("")
    setAmount("")
    setPurpose("")
    setExpiresInDays(7)
    setQuery("")
    setPicked(null)
    setPatientName("")
    setPatientPhone("")
    setProviderId(
      doctors.find((d) => d.id === myUserId)?.id || doctors[0]?.id || "",
    )
  }, [open, doctors, myUserId])

  useEffect(() => {
    if (!open || booking || !practiceId || patients.length) return
    let cancelled = false
    void proctoService.listPracticePatients(practiceId).then((res) => {
      if (cancelled || res?.status !== "successful") return
      const rows = (res.data ?? []) as Array<{
        name?: string | null
        phone?: string | null
        patientId?: string | null
        mrn?: string | null
      }>
      setPatients(
        rows
          .filter((r) => r.phone)
          .map((r, i) => ({
            key: `${r.phone}-${r.name ?? ""}-${i}`,
            name: r.name?.trim() || "Patient",
            phone: String(r.phone),
            patientId: r.patientId ?? null,
            mrn: r.mrn ?? null,
          })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [open, booking, practiceId, patients.length])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || picked) return []
    const digits = q.replace(/\D/g, "")
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && p.phone.includes(digits)) ||
          (p.mrn ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [patients, query, picked])

  function pick(p: PatientOption) {
    setPicked(p)
    setQuery(p.name)
    setPatientName(p.name)
    setPatientPhone(p.phone)
  }

  async function submit() {
    if (!practiceId) return
    const rupees = Number(amount.replace(/[₹,\s]/g, ""))
    if (!Number.isFinite(rupees) || rupees < 1) {
      setMessage("Enter the amount in ₹ (at least ₹1).")
      return
    }
    if (!purpose.trim()) {
      setMessage("Add what the payment is for.")
      return
    }
    const name = (picked?.name || patientName || query).trim()
    const phone = (picked?.phone || patientPhone).replace(/\D/g, "")
    if (!booking) {
      if (!name) {
        setMessage("Enter the patient name.")
        return
      }
      if (phone.length < 10) {
        setMessage("Enter a valid patient mobile number.")
        return
      }
    }
    setSubmitting(true)
    setMessage("")
    const res = await proctoService.createPaymentRequest({
      practiceId,
      amount: rupees,
      purpose: purpose.trim(),
      expiresInDays,
      ...(booking
        ? { bookingId: booking.id }
        : {
            patientName: name,
            patientPhone: phone,
            ...(picked?.patientId ? { patientId: picked.patientId } : {}),
            ...(isAdmin && providerId ? { providerId } : {}),
          }),
    })
    setSubmitting(false)
    if (res?.status === "successful" && res.data) {
      onSent(res.data as PaymentRequestRow)
      onClose()
      return
    }
    setMessage(res?.message || "Could not send the payment request.")
  }

  const fieldClass =
    "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

  return (
    <PopupModal
      open={open}
      handler={onClose}
      title="Request payment"
      direction="center"
      className="max-h-[90vh] w-full max-w-lg overflow-y-auto !h-auto"
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
          {submitting ? "Sending…" : "Send on WhatsApp"}
        </button>
      }
    >
      <form
        className="space-y-3 px-4 pb-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-neutral-600 dark:text-neutral-400">
          The patient gets a secure Razorpay link on WhatsApp (UPI, card or
          netbanking). You&apos;ll see the status in Payments.
        </p>

        {booking ? (
          <p>
            <span className="font-semibold">Patient: </span>
            {booking.patientName || "Patient"}
            {booking.patientPhone
              ? ` · ${formatPhoneDisplay(booking.patientPhone)}`
              : ""}
          </p>
        ) : (
          <>
            <label className="relative block">
              <span className="font-semibold">Patient</span>
              <input
                className={fieldClass}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPicked(null)
                  setPatientName(e.target.value)
                }}
                placeholder="Search name, mobile or MRN — or type a new name"
                autoComplete="off"
                autoFocus
              />
              {suggestions.length ? (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {suggestions.map((p) => (
                    <li key={p.key}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        onClick={() => pick(p)}
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-xs text-neutral-500">
                          {formatPhoneDisplay(p.phone)}
                          {p.mrn ? ` · ${p.mrn}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <label className="block">
              <span className="font-semibold">Patient WhatsApp number</span>
              <input
                className={fieldClass}
                value={picked ? formatPhoneDisplay(picked.phone) : patientPhone}
                onChange={(e) => {
                  setPicked(null)
                  setPatientPhone(e.target.value)
                }}
                placeholder="10-digit mobile"
                inputMode="tel"
                autoComplete="off"
              />
            </label>
            {isAdmin && doctors.length > 1 ? (
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
            ) : null}
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-semibold">Amount (₹)</span>
            <input
              className={fieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1500"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={Boolean(booking)}
            />
          </label>
          <label className="block">
            <span className="font-semibold">Link valid for</span>
            <select
              className={fieldClass}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="font-semibold">For</span>
          <input
            className={fieldClass}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Blood tests, dressing, follow-up package"
            maxLength={120}
            autoComplete="off"
          />
        </label>

        {message ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </PopupModal>
  )
}
