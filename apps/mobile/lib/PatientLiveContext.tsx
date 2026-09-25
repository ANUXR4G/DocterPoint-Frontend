import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePatientLiveSocket } from "@/hooks/useLiveSocket";
import { api } from "@/lib/api";
import {
  getCachedBookings,
  setCachedBookings,
} from "@/lib/dataCache";
import { applyLiveBookingEvent, patchBookingFields } from "@/lib/liveBooking";
import type { ProctoBooking } from "@/lib/types";

type PatientLiveValue = {
  bookings: ProctoBooking[];
  loading: boolean;
  ready: boolean;
  liveConnected: boolean;
  error: string | null;
  refresh: (opts?: { soft?: boolean; force?: boolean }) => Promise<void>;
  patchBooking: (id: string, patch: Partial<ProctoBooking>) => void;
};

const PatientLiveContext = createContext<PatientLiveValue | null>(null);

/** One patient WS + shared bookings for the signed-in Expo shell (mirrors web). */
export function PatientLiveProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<ProctoBooking[]>(
    () => getCachedBookings() ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedBookings());
  const [ready, setReady] = useState(() => Boolean(getCachedBookings()));
  const [liveConnected, setLiveConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoftAt = useRef(0);
  const loadGen = useRef(0);

  const refresh = useCallback(async (opts?: { soft?: boolean; force?: boolean }) => {
    const soft = Boolean(opts?.soft);
    const force = Boolean(opts?.force);

    if (!force && soft) {
      const cached = getCachedBookings();
      if (cached) {
        setBookings(cached);
        setLoading(false);
        setReady(true);
        return;
      }
    }

    const gen = ++loadGen.current;
    if (!soft) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api<ProctoBooking[]>("/procto/bookings/mine");
      if (gen !== loadGen.current) return;
      if (res.status === "successful" && Array.isArray(res.data)) {
        setBookings(res.data);
        setCachedBookings(res.data);
      } else if (!soft) {
        setBookings([]);
        setError(res.message || "Could not load your bookings.");
      }
    } catch {
      if (!soft) {
        setBookings([]);
        setError("Could not load your bookings.");
      }
    } finally {
      if (gen === loadGen.current && !soft) {
        setLoading(false);
        setReady(true);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current);
    };
  }, [refresh]);

  function scheduleSoftRefresh() {
    const now = Date.now();
    if (now - lastSoftAt.current < 2_000) return;
    if (softTimer.current) clearTimeout(softTimer.current);
    softTimer.current = setTimeout(() => {
      lastSoftAt.current = Date.now();
      void refresh({ soft: true, force: true });
    }, 400);
  }

  usePatientLiveSocket(
    ready,
    (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        !("event" in event)
      ) {
        return;
      }
      if (event.event === "conversation_updated") return;
      if (
        event.event !== "booking_created" &&
        event.event !== "booking_updated"
      ) {
        scheduleSoftRefresh();
        return;
      }
      const incoming =
        "booking" in event
          ? (event.booking as Record<string, unknown>)
          : undefined;
      setBookings((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          String(event.event),
          incoming,
        );
        setCachedBookings(next);
        if (needsRefresh) scheduleSoftRefresh();
        return next;
      });
    },
    scheduleSoftRefresh,
    () => setLiveConnected(true),
    () => setLiveConnected(false),
  );

  const patchBooking = useCallback(
    (id: string, patch: Partial<ProctoBooking>) => {
      setBookings((prev) => {
        const next = prev.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        );
        setCachedBookings(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    (): PatientLiveValue => ({
      bookings,
      loading,
      ready,
      liveConnected,
      error,
      refresh,
      patchBooking,
    }),
    [bookings, loading, ready, liveConnected, error, refresh, patchBooking],
  );

  return (
    <PatientLiveContext.Provider value={value}>
      {children}
    </PatientLiveContext.Provider>
  );
}

export function usePatientLive() {
  const ctx = useContext(PatientLiveContext);
  if (!ctx) {
    throw new Error("usePatientLive must be used within PatientLiveProvider");
  }
  return ctx;
}

export function usePatientLiveOptional() {
  return useContext(PatientLiveContext);
}

/** Prefer shared live list; fall back to a one-off patch helper. */
export function useLiveBooking(bookingId: string | undefined) {
  const live = usePatientLiveOptional();
  const fromList = live?.bookings.find((b) => b.id === bookingId) ?? null;

  return {
    booking: fromList,
    liveConnected: live?.liveConnected ?? false,
    refresh: live?.refresh,
    applyIncoming: (incoming: Record<string, unknown>) => {
      if (!live || !bookingId) return;
      live.patchBooking(
        bookingId,
        patchBookingFields({ id: bookingId }, incoming) as Partial<ProctoBooking>,
      );
    },
  };
}
