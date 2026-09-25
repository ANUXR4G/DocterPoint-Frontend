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
import { usePatientLiveSocket } from "@/hooks/useProctoSocket"
import { applyLiveBookingEvent } from "@/lib/liveBooking"
import { sortBookingsByWhen } from "@/lib/bookingDisplay"

type PatientDashboardValue = {
  loading: boolean
  ready: boolean
  liveConnected: boolean
  error: string | null
  bookings: ProctoBooking[]
  refresh: (opts?: { silent?: boolean }) => Promise<void>
  patchBooking: (id: string, patch: Partial<ProctoBooking>) => void
}

const PatientDashboardContext = createContext<PatientDashboardValue | null>(
  null,
)

export function PatientDashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<ProctoBooking[]>([])
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSoftAt = useRef(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await proctoService.getMyBookings()
      if (res?.status === "successful") {
        setBookings(
          sortBookingsByWhen((res.data as ProctoBooking[]) ?? [], "desc"),
        )
      } else if (!opts?.silent) {
        setBookings([])
        setError(res?.message || "Could not load your bookings.")
      }
    } catch {
      if (!opts?.silent) {
        setBookings([])
        setError("Could not load your bookings.")
      }
    } finally {
      if (!opts?.silent) {
        setLoading(false)
        setReady(true)
      }
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current)
    }
  }, [load])

  function scheduleSoftRefresh() {
    const now = Date.now()
    if (now - lastSoftAt.current < 2_000) return
    if (softTimer.current) clearTimeout(softTimer.current)
    softTimer.current = setTimeout(() => {
      lastSoftAt.current = Date.now()
      void load({ silent: true })
    }, 400)
  }

  usePatientLiveSocket(
    ready,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        event.event === "conversation_updated"
      ) {
        return
      }
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        (event.event === "booking_created" || event.event === "booking_updated")
      ) {
        const incoming = (event as { booking?: Record<string, unknown> })
          .booking
        setBookings((prev) => {
          const { next, needsRefresh } = applyLiveBookingEvent(
            prev,
            String(event.event),
            incoming,
          )
          if (needsRefresh) scheduleSoftRefresh()
          return sortBookingsByWhen(next, "desc")
        })
        return
      }
      scheduleSoftRefresh()
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
    (): PatientDashboardValue => ({
      loading,
      ready,
      liveConnected,
      error,
      bookings,
      refresh: load,
      patchBooking,
    }),
    [loading, ready, liveConnected, error, bookings, load, patchBooking],
  )

  return (
    <PatientDashboardContext.Provider value={value}>
      {children}
    </PatientDashboardContext.Provider>
  )
}

export function usePatientDashboard() {
  const ctx = useContext(PatientDashboardContext)
  if (!ctx) {
    throw new Error(
      "usePatientDashboard must be used within PatientDashboardProvider",
    )
  }
  return ctx
}

export function usePatientDashboardOptional() {
  return useContext(PatientDashboardContext)
}
