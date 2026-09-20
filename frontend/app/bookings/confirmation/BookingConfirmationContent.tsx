"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { IconCalendar, IconCheck, IconMapPin } from "@tabler/icons-react"
import PublicShell from "@/components/layout/PublicShell"
import { FlipEfButton } from "@/components"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import {
  bookingStatusTone,
  formatBookingStatus,
} from "@/lib/bookingStatusTone"

function formatWhen(booking: ProctoBooking) {
  const token = booking.tokenNumber ?? booking.token_number
  const session = booking.sessionDate ?? booking.session_date
  const slot = booking.slotStart ?? booking.slot_start
  if (booking.mode === "TOKEN_BASED" && token) {
    const day = session ? new Date(session).toLocaleDateString() : ""
    return `Token #${token} on ${day}`
  }
  if (slot) return new Date(slot).toLocaleString()
  return "—"
}

/** Prefer street address over generic branch labels like "Main Clinic". */
function formatLocationLine(loc: {
  name?: string | null
  address?: string | null
  city?: string | null
}): string {
  const name = String(loc.name || "").trim()
  const address = String(loc.address || "").trim()
  const city = String(loc.city || "").trim()
  const place = [address, city && !address.toLowerCase().includes(city.toLowerCase()) ? city : ""]
    .filter(Boolean)
    .join(", ")
  const generic =
    !name || /^(main\s*clinic|primary|default|head\s*office)$/i.test(name)
  if (place) {
    if (!generic && !place.toLowerCase().includes(name.toLowerCase())) {
      return `${name} — ${place}`
    }
    return place
  }
  return name || "—"
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 bg-sky-50/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  )
}

export default function BookingConfirmationContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const [booking, setBooking] = useState<ProctoBooking | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    proctoService.getBooking(id).then((res) => {
      if (res.status === "successful") setBooking(res.data as ProctoBooking)
      setLoading(false)
    })
  }, [id])

  return (
    <PublicShell active="find">
      <div className="mx-auto w-full min-w-0 max-w-lg">
        {loading && (
          <p className="text-center text-sm text-slate-500">
            Loading confirmation…
          </p>
        )}

        {!loading && !booking && (
          <div className="dashboard-panel text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Booking not found.
            </p>
            <Link
              href="/practices"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-sky-400"
            >
              Find doctors
            </Link>
          </div>
        )}

        {booking && (
          <>
            <header className="dashboard-hero text-center">
              <div aria-hidden className="dashboard-hero-glow" />
              <div className="relative">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30">
                  <IconCheck className="size-8" stroke={2} />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  Booking confirmed
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  WhatsApp confirmation will be sent if the clinic has messaging
                  enabled.
                </p>
                <span
                  className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusTone(booking.status)}`}
                >
                  {formatBookingStatus(booking.status)}
                </span>
              </div>
            </header>

            <section className="dashboard-panel mt-6 space-y-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
                  <IconCalendar className="size-[18px]" stroke={1.75} />
                </span>
                <h2 className="dashboard-section-title">Appointment details</h2>
              </div>

              <DetailRow
                label="Practice"
                value={booking.practice?.name ?? "—"}
              />
              <DetailRow label="When" value={formatWhen(booking)} />
              <DetailRow
                label="Location"
                value={
                  booking.location
                    ? formatLocationLine(booking.location)
                    : "—"
                }
              />
              <DetailRow
                label="Reference"
                value={`${booking.id.slice(0, 8)}…`}
              />
              {Array.isArray(booking.documents) &&
              booking.documents.length > 0 ? (
                <DetailRow
                  label="Documents"
                  value={`${booking.documents.length} file${booking.documents.length === 1 ? "" : "s"} attached`}
                />
              ) : null}
            </section>

            {booking.location ? (
              <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs text-slate-500 dark:text-slate-400">
                <IconMapPin className="mt-0.5 size-4 shrink-0 text-blue-600" />
                <span>
                  {booking.location.address}, {booking.location.city}
                </span>
              </p>
            ) : null}

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <FlipEfButton
                href="/patient/bookings"
                className="h-11 rounded-xl bg-blue-600 !py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                My bookings
              </FlipEfButton>
              <Link
                href="/practices"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600 dark:border-white/15 dark:bg-slate-900 dark:text-slate-200"
              >
                Book another
              </Link>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  )
}
