"use client"

import { useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import type { ProctoBooking } from "@/lib/services/procto"
import { formatBookingWhenDetailed } from "@/lib/bookingDisplay"
import { formatPhoneDisplay } from "@/lib/formatPhone"

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—"
}

function patientName(booking: ProctoBooking) {
  return (
    booking.patientName ||
    booking.patient_name ||
    booking.patient?.name ||
    "Patient"
  )
}

function patientPhone(booking: ProctoBooking) {
  return formatPhoneDisplay(
    booking.patientPhone ||
      booking.patient_phone ||
      booking.patient?.phone ||
      booking.patient?.contactNumber,
  )
}

function statusBadgeClass(status: string) {
  switch ((status || "").toUpperCase()) {
    case "COMPLETED":
      return "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100"
    case "IN_PROGRESS":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    case "CANCELED":
    case "NO_SHOW":
      return "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
    default:
      return "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
  }
}

function formatDob(raw: string | null | undefined) {
  if (!raw) return "—"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function BookingHoverDetailsPanel({
  booking,
}: {
  booking: ProctoBooking
}) {
  const p = booking.patient
  const docCount = Array.isArray(booking.documents)
    ? booking.documents.length
    : 0
  const token = booking.tokenNumber ?? booking.token_number

  return (
    <div
      className="w-80 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-2xl dark:border-neutral-600 dark:bg-neutral-900 sm:w-96"
      role="tooltip"
    >
      <p className="text-base font-bold text-neutral-900 dark:text-white">
        {patientName(booking)}
      </p>

      <dl className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Phone</dt>
          <dd className="text-right font-semibold">{patientPhone(booking)}</dd>
        </div>
        {p?.email ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Email</dt>
            <dd className="text-right font-semibold">{p.email}</dd>
          </div>
        ) : null}
        {p?.gender ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Gender</dt>
            <dd className="font-semibold">{p.gender}</dd>
          </div>
        ) : null}
        {p?.dateOfBirth ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Date of birth</dt>
            <dd className="font-semibold">{formatDob(p.dateOfBirth)}</dd>
          </div>
        ) : null}
        {p?.address ? (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 opacity-60">Address</dt>
            <dd className="text-right font-semibold">{p.address}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">When</dt>
          <dd className="text-right font-semibold">
            {formatBookingWhenDetailed(booking)}
          </dd>
        </div>
        {token != null ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Token</dt>
            <dd className="font-semibold">#{token}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Doctor</dt>
          <dd className="text-right font-semibold">
            {booking.provider?.name ? `Dr ${booking.provider.name}` : "—"}
          </dd>
        </div>
        {booking.location ? (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 opacity-60">Location</dt>
            <dd className="text-right font-semibold">
              {booking.location.name}, {booking.location.city}
            </dd>
          </div>
        ) : null}
        {booking.disease?.trim() &&
        !/^general\s+consultation$/i.test(booking.disease.trim()) ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Reason</dt>
            <dd className="text-right font-semibold">
              {booking.disease.trim()}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Mode</dt>
          <dd className="font-semibold">
            {(booking.mode || "").replace(/_/g, " ") || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Channel</dt>
          <dd className="font-semibold">
            {(booking.channel || "").replace(/_/g, " ") || "—"}
          </dd>
        </div>
        {docCount > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Documents</dt>
            <dd className="font-semibold">
              {docCount} file{docCount === 1 ? "" : "s"}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="opacity-60">Status</dt>
          <dd>
            <span
              className={`inline-block rounded-md px-2 py-1 text-xs font-bold ${statusBadgeClass(booking.status)}`}
            >
              {(booking.status || "").replace(/_/g, " ")}
            </span>
          </dd>
        </div>
      </dl>

      <Link
        href={`/doctor/queue/${booking.id}`}
        className="mt-3 block border-t border-neutral-100 pt-3 text-xs font-bold text-[var(--theme-primary)] hover:underline dark:border-neutral-700"
      >
        Open visit →
      </Link>
    </div>
  )
}

/** Hover (or focus) on patient name to show full booking + patient details. */
export function PatientNameHover({
  booking,
  children,
  className = "",
}: {
  booking: ProctoBooking
  children?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  function show() {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelW = 384
    const panelH = 360
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
    <span
      ref={ref}
      className={`cursor-help underline decoration-dotted decoration-neutral-400 underline-offset-2 dark:decoration-neutral-500 ${className}`}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-describedby={open ? `booking-hover-${booking.id}` : undefined}
    >
      {children ?? patientName(booking)}
      {open
        ? createPortal(
            <div
              id={`booking-hover-${booking.id}`}
              className="pointer-events-none fixed z-[9999]"
              style={{ top: pos.top, left: pos.left }}
            >
              <BookingHoverDetailsPanel booking={booking} />
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
