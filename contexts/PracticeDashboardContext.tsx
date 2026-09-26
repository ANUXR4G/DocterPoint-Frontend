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
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { useProctoSocket } from "@/hooks/useProctoSocket"
import {
  applyLiveBookingEvent,
  patchPatientsFromBooking,
} from "@/lib/liveBooking"
import { sortBookingsByWhen } from "@/lib/bookingDisplay"
import { practiceDateIso, practiceShiftDays, practiceTodayIso } from "@/lib/practiceTime"

export type PracticeMembership = {
  id?: string
  practiceId?: string
  role?: string
  userId?: string
  practice: {
    id: string
    name: string
    slug?: string
    type?: string
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
  /** Number used to place the booking (WhatsApp / clinic book). Same as phone. */
  bookedViaPhone?: string | null
  name: string | null
  patientId: string | null
  /** Medical Record Number, e.g. MR00000042 or PCMR00000001 (clinic/doctor prefix). */
  mrn?: string | null
  /** WhatsApp / portal General Documents on the patient record. */
  attachments?: Array<{
    name: string
    url: string
    uploadedAt?: string
  }> | null
  /** Spouse / Child / Parent when this profile is a family dependent. */
  relationship?: string | null
  email?: string | null
  gender?: string | null
  address?: string | null
  imgSrc?: string | null
  profession?: string | null
  dateOfBirth?: string | null
  age?: number | null
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
    patientName?: string | null
    patientPhone?: string | null
  }>
}

type PracticeDashboardValue = {
  /** True only while membership is unresolved on first paint. */
  loading: boolean
  /**
   * Practice id / membership ready — UI and live socket may proceed.
   * Bookings/patients may still fill in after (bootstrap).
   */
  ready: boolean
  /**
   * True after the first ±90d bookings/patients bootstrap attempt finishes.
   * Do not treat an empty list as “no visits” until this is true.
   */
  hydrated: boolean
  liveConnected: boolean
  error: string | null
  memberships: PracticeMembership[]
  practiceId: string | null
  practiceName: string | null
  /** SOLO | CLINIC | MEDICAL_CENTER — from primary membership. */
  practiceType: string | null
  /** Self-registered independent doctor (SOLO practice). */
  isIndependentPractice: boolean
  /** Clinic-rostered staff doctor (not owner/admin). */
  isClinicStaffDoctor: boolean
  /** Current user's membership role on the primary practice. */
  membershipRole: string | null
  /** Current user id from membership (provider id for staff doctors). */
  actorUserId: string | null
  /** PRACTICE_OWNER or PRACTICE_ADMIN — can manage full roster / clinic settings. */
  isClinicAdmin: boolean
  bookings: ProctoBooking[]
  patients: PracticePatientRow[]
  /** Increments when WhatsApp inbox may have changed (single shared WS). */
  conversationTick: number
  /** Increments on booking_created / booking_updated (notifications soft-refresh). */
  bookingTick: number
  /** Increments on notification_created (Notifications tab soft-refresh). */
  notificationTick: number
  refresh: (opts?: { silent?: boolean }) => Promise<void>
  patchBooking: (id: string, patch: Partial<ProctoBooking>) => void
  setBookings: React.Dispatch<React.SetStateAction<ProctoBooking[]>>
}

const PracticeDashboardContext = createContext<PracticeDashboardValue | null>(
  null,
)

export function bookingDateIso(b: ProctoBooking): string | null {
  const slot = b.slotStart ?? (b as { slot_start?: string }).slot_start
  if (slot) {
    const iso = practiceDateIso(String(slot))
    if (iso) return iso
  }
  const session =
    b.sessionDate ?? (b as { session_date?: string }).session_date
  if (session) {
    return practiceDateIso(String(session))
  }
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
  const [hydrated, setHydrated] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<PracticeMembership[]>([])
  const [bookings, setBookings] = useState<ProctoBooking[]>([])
  const [patients, setPatients] = useState<PracticePatientRow[]>([])
  const [conversationTick, setConversationTick] = useState(0)
  const [bookingTick, setBookingTick] = useState(0)
  const [notificationTick, setNotificationTick] = useState(0)
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootInFlight = useRef(false)
  const lastBootAt = useRef(0)
  const hydratedRef = useRef(false)

  const practiceId =
    proctoService.resolvePracticeId(memberships[0]) ?? null
  const practiceName = memberships[0]?.practice?.name ?? null
  const practiceType = memberships[0]?.practice?.type ?? null
  const membershipRole = memberships[0]?.role ?? null
  const actorUserId = memberships[0]?.userId ?? null
  const isClinicAdmin =
    membershipRole === "PRACTICE_OWNER" ||
    membershipRole === "PRACTICE_ADMIN"
  const isIndependentPractice = practiceType === "SOLO"
  const isClinicStaffDoctor =
    !isIndependentPractice &&
    membershipRole === "DOCTOR" &&
    !isClinicAdmin

  const applyMembership = useCallback((mem: PracticeMembership[]) => {
    if (!mem.length) return
    setMemberships(mem)
    setReady(true)
    setLoading(false)
    setError(null)
  }, [])

  /** Heavy ±90d bootstrap — never blocks ready/socket. */
  const bootstrapBookings = useCallback(async () => {
    if (bootInFlight.current) return
    const now = Date.now()
    // Avoid stampeding Supabase when WS reconnect storms fire.
    if (hydratedRef.current && now - lastBootAt.current < 4_000) return
    bootInFlight.current = true
    lastBootAt.current = now
    try {
      const todayIso = practiceTodayIso()
      const boot = await proctoService.getPracticeBootstrap({
        from: practiceShiftDays(todayIso, -90),
        to: practiceShiftDays(todayIso, 90),
      })

      let mem: PracticeMembership[] = []
      let nextBookings: ProctoBooking[] = []
      let nextPatients: PracticePatientRow[] = []

      if (boot.status === "successful" && boot.data) {
        if (
          Array.isArray(boot.data.memberships) &&
          boot.data.memberships.length
        ) {
          mem = boot.data.memberships as PracticeMembership[]
        }
        nextBookings = (Array.isArray(boot.data.bookings)
          ? boot.data.bookings
          : []) as ProctoBooking[]
        nextPatients = (Array.isArray(boot.data.patients)
          ? boot.data.patients
          : []) as PracticePatientRow[]
      }

      if (mem.length) applyMembership(mem)
      if (boot.status === "successful") {
        setBookings(sortBookingsByWhen(nextBookings, "asc"))
        setPatients(nextPatients)
      }
    } finally {
      bootInFlight.current = false
      hydratedRef.current = true
      setHydrated(true)
    }
  }, [applyMembership])

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true)
        hydratedRef.current = false
        setHydrated(false)
        setError(null)
      }

      let mem: PracticeMembership[] = []
      try {
        const mineEarly = await proctoService.getMyPractices()
        if (
          mineEarly.status === "successful" &&
          Array.isArray(mineEarly.data) &&
          mineEarly.data.length
        ) {
          mem = mineEarly.data as PracticeMembership[]
          applyMembership(mem)
        }
      } catch {
        /* bootstrap may still succeed */
      }

      await bootstrapBookings()

      if (mem.length) return

      proctoService.invalidateMyPracticesCache()
      try {
        const mine = await proctoService.getMyPractices()
        if (
          mine.status === "successful" &&
          Array.isArray(mine.data) &&
          mine.data.length
        ) {
          applyMembership(mine.data as PracticeMembership[])
          return
        }
      } catch {
        /* empty */
      }

      if (!opts?.silent) {
        setMemberships([])
        setBookings([])
        setPatients([])
        setError("Could not load practice.")
        setLoading(false)
        setReady(true)
        hydratedRef.current = true
        setHydrated(true)
      }
    },
    [applyMembership, bootstrapBookings],
  )

  useEffect(() => {
    void load()
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current)
    }
    // Initial mount only — load identity is stable enough via refs for soft refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scheduleSoftRefresh() {
    if (softTimer.current) clearTimeout(softTimer.current)
    // Debounced bootstrap only — never flip loading/ready.
    softTimer.current = setTimeout(() => void bootstrapBookings(), 800)
  }

  useProctoSocket(
    practiceId,
    (event) => {
      if (event.event === "conversation_updated") {
        // Inbox panels listen via conversationTick — do not re-bootstrap ±90d.
        setConversationTick((n) => n + 1)
        return
      }
      if (event.event === "notification_created") {
        setNotificationTick((n) => n + 1)
        return
      }
      setBookingTick((n) => n + 1)
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
      setPatients((prev) => patchPatientsFromBooking(prev, incoming))
      if (event.event === "booking_created") {
        scheduleSoftRefresh()
      }
    },
    scheduleSoftRefresh,
    () => setLiveConnected(true),
    () => setLiveConnected(false),
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
      hydrated,
      liveConnected,
      error,
      memberships,
      practiceId,
      practiceName,
      practiceType,
      isIndependentPractice,
      isClinicStaffDoctor,
      membershipRole,
      actorUserId,
      isClinicAdmin,
      bookings,
      patients,
      conversationTick,
      bookingTick,
      notificationTick,
      refresh: load,
      patchBooking,
      setBookings,
    }),
    [
      loading,
      ready,
      hydrated,
      liveConnected,
      error,
      memberships,
      practiceId,
      practiceName,
      practiceType,
      isIndependentPractice,
      isClinicStaffDoctor,
      membershipRole,
      actorUserId,
      isClinicAdmin,
      bookings,
      patients,
      conversationTick,
      bookingTick,
      notificationTick,
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
