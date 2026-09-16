"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { addDays, format, subDays } from "date-fns"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { useProctoSocket } from "@/hooks/useProctoSocket"
import { applyLiveBookingEvent } from "@/lib/liveBooking"
import { sortBookingsByWhen } from "@/lib/bookingDisplay"

export type PracticeMembership = {
  id?: string
  practiceId?: string
  role?: string
  userId?: string
  practice: {
    id: string
    name: string
    slug?: string
    members?: Array<{
      userId: string
      role: string
      isActive?: boolean
      user?: { name?: string | null; email?: string | null }
    }>
  }
}

export type PracticePatientRow = {
  phone: string
  name: string | null
  patientId: string | null
  email?: string | null
  gender?: string | null
  address?: string | null
  imgSrc?: string | null
  profession?: string | null
  dateOfBirth?: string | null
  bookingCount: number
  lastVisitAt: string | null
  lastStatus: string | null
  providerNames: string[]
  recentBookings: Array<{
    id: string
    status: string
    disease?: string | null
    consultationType?: string | null
    notes?: string | null
    doctorRemarks?: string | null
    slotStart?: string | null
    sessionDate?: string | null
    createdAt?: string
  }>
}

type PracticeDashboardValue = {
  /** True only on the very first load for this session. */
  loading: boolean
  ready: boolean
  error: string | null
  memberships: PracticeMembership[]
  practiceId: string | null
  practiceName: string | null
  bookings: ProctoBooking[]
  patients: PracticePatientRow[]
  /** Increments when WhatsApp inbox may have changed (single shared WS). */
  conversationTick: number
  refresh: (opts?: { silent?: boolean }) => Promise<void>
  patchBooking: (id: string, patch: Partial<ProctoBooking>) => void
  setBookings: React.Dispatch<React.SetStateAction<ProctoBooking[]>>
}

const PracticeDashboardContext = createContext<PracticeDashboardValue | null>(
  null,
)

export function bookingDateIso(b: ProctoBooking): string | null {
  const slot = b.slotStart ?? (b as { slot_start?: string }).slot_start
  if (slot) return String(slot).slice(0, 10)
  const session =
    b.sessionDate ?? (b as { session_date?: string }).session_date
  if (session) return String(session).slice(0, 10)
  return null
}

function bookingOnDate(b: ProctoBooking, dateIso: string): boolean {
  return bookingDateIso(b) === dateIso
}

/** Bookings whose visit day falls in [from, to] (inclusive ISO dates). */
export function filterBookingsByRange(
  bookings: ProctoBooking[],
  from: string,
  to: string,
): ProctoBooking[] {
  return bookings.filter((b) => {
    const d = bookingDateIso(b)
    return d != null && d >= from && d <= to
  })
}

/** Bookings for a calendar day from the shared ±90d cache. */
export function filterBookingsByDate(
  bookings: ProctoBooking[],
  dateIso: string,
): ProctoBooking[] {
  return bookings.filter((b) => bookingOnDate(b, dateIso))
}

export function PracticeDashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<PracticeMembership[]>([])
  const [bookings, setBookings] = useState<ProctoBooking[]>([])
  const [patients, setPatients] = useState<PracticePatientRow[]>([])
  const [conversationTick, setConversationTick] = useState(0)
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const practiceId = memberships[0]?.practice?.id ?? null
  const practiceName = memberships[0]?.practice?.name ?? null

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    if (!opts?.silent) setError(null)

    const today = new Date()
    const boot = await proctoService.getPracticeBootstrap({
      from: format(subDays(today, 90), "yyyy-MM-dd"),
      to: format(addDays(today, 90), "yyyy-MM-dd"),
    })

    if (boot.status !== "successful" || !boot.data) {
      if (!opts?.silent) {
        setMemberships([])
        setBookings([])
        setPatients([])
        setError(boot.message || "Could not load practice.")
        setLoading(false)
        setReady(true)
      }
      return
    }

    const mem = (boot.data.memberships ?? []) as PracticeMembership[]
    setMemberships(mem)
    setBookings(
      sortBookingsByWhen(
        (Array.isArray(boot.data.bookings)
          ? boot.data.bookings
          : []) as ProctoBooking[],
        "asc",
      ),
    )
    setPatients(
      (Array.isArray(boot.data.patients)
        ? boot.data.patients
        : []) as PracticePatientRow[],
    )
    if (!opts?.silent) {
      setLoading(false)
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current)
    }
  }, [load])

  function scheduleSoftRefresh() {
    if (softTimer.current) clearTimeout(softTimer.current)
    softTimer.current = setTimeout(() => void load({ silent: true }), 300)
  }

  useProctoSocket(
    practiceId,
    (event) => {
      if (event.event === "conversation_updated") {
        setConversationTick((n) => n + 1)
        scheduleSoftRefresh()
        return
      }
      const incoming = event.booking as Record<string, unknown> | undefined
      setBookings((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          event.event,
          incoming,
        )
        if (needsRefresh) scheduleSoftRefresh()
        return sortBookingsByWhen(next, "asc")
      })
    },
    scheduleSoftRefresh,
  )

  const patchBooking = useCallback(
    (id: string, patch: Partial<ProctoBooking>) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      )
    },
    [],
  )

  const value = useMemo(
    (): PracticeDashboardValue => ({
      loading,
      ready,
      error,
      memberships,
      practiceId,
      practiceName,
      bookings,
      patients,
      conversationTick,
      refresh: load,
      patchBooking,
      setBookings,
    }),
    [
      loading,
      ready,
      error,
      memberships,
      practiceId,
      practiceName,
      bookings,
      patients,
      conversationTick,
      load,
      patchBooking,
    ],
  )

  return (
    <PracticeDashboardContext.Provider value={value}>
      {children}
    </PracticeDashboardContext.Provider>
  )
}

export function usePracticeDashboard() {
  const ctx = useContext(PracticeDashboardContext)
  if (!ctx) {
    throw new Error(
      "usePracticeDashboard must be used within PracticeDashboardProvider",
    )
  }
  return ctx
}

/** Safe hook for widgets that may render outside provider (falls back to empty). */
export function usePracticeDashboardOptional() {
  return useContext(PracticeDashboardContext)
}
