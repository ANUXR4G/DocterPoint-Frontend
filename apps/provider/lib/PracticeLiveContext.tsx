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
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";
import { applyLiveBookingEvent, patchBookingFields } from "@/lib/liveBooking";
import { selfProviderScope, usePractice } from "@/lib/practiceContext";
import {
  fetchPracticeBookings,
  fetchPracticePatients,
} from "@/lib/procto";
import { addDays, type BookingRow, type PracticePatient, ymd } from "@/lib/types";
import { practiceDateIso } from "@/lib/practiceTime";

type PracticeLiveValue = {
  bookings: BookingRow[];
  patients: PracticePatient[];
  loading: boolean;
  ready: boolean;
  liveConnected: boolean;
  error: string | null;
  /** Bumps on booking create/update / reconnect soft-refresh. */
  bookingTick: number;
  /** Bumps on WhatsApp conversation_updated. */
  conversationTick: number;
  /** Bumps on any live event (schedule/analytics soft refresh). */
  opsTick: number;
  refresh: (opts?: { soft?: boolean; force?: boolean }) => Promise<void>;
  patchBooking: (id: string, patch: Partial<BookingRow>) => void;
  bookingsOnDate: (dateIso: string) => BookingRow[];
  bookingsInRange: (from: string, to: string) => BookingRow[];
};

const PracticeLiveContext = createContext<PracticeLiveValue | null>(null);

function bookingDayKey(b: BookingRow): string {
  if (b.sessionDate) return String(b.sessionDate).slice(0, 10);
  if (b.slotStart) return practiceDateIso(b.slotStart) ?? "";
  return "";
}

function matchesProvider(b: BookingRow, providerId: string | undefined) {
  if (!providerId) return true;
  return (
    b.provider?.id === providerId ||
    (b as { providerId?: string }).providerId === providerId
  );
}

/** One procto practice WS + shared ±90d bookings for the doctor Expo shell. */
export function PracticeLiveProvider({ children }: { children: ReactNode }) {
  const { practiceId, membership } = usePractice();
  const selfProviderId = selfProviderScope(membership);

  const range = useMemo(() => {
    const today = new Date();
    return {
      from: ymd(addDays(today, -90)),
      to: ymd(addDays(today, 90)),
    };
  }, []);

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [patients, setPatients] = useState<PracticePatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingTick, setBookingTick] = useState(0);
  const [conversationTick, setConversationTick] = useState(0);
  const [opsTick, setOpsTick] = useState(0);

  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoftAt = useRef(0);
  const loadGen = useRef(0);

  const refresh = useCallback(
    async (opts?: { soft?: boolean; force?: boolean }) => {
      if (!practiceId) return;
      const soft = Boolean(opts?.soft);
      const gen = ++loadGen.current;
      if (!soft) {
        setLoading(true);
        setError(null);
      }
      try {
        const [bRes, pRes] = await Promise.all([
          fetchPracticeBookings(practiceId, {
            from: range.from,
            to: range.to,
            providerId: selfProviderId,
          }),
          fetchPracticePatients(practiceId),
        ]);
        if (gen !== loadGen.current) return;
        if (bRes.status === "successful" && Array.isArray(bRes.data)) {
          setBookings(bRes.data as BookingRow[]);
        } else if (!soft) {
          setBookings([]);
          setError(bRes.message || "Could not load bookings.");
        }
        if (pRes.status === "successful" && Array.isArray(pRes.data)) {
          setPatients(pRes.data as PracticePatient[]);
        }
      } catch {
        if (!soft) {
          setBookings([]);
          setError("Could not load practice data.");
        }
      } finally {
        if (gen === loadGen.current && !soft) {
          setLoading(false);
          setReady(true);
        }
      }
    },
    [practiceId, range.from, range.to, selfProviderId],
  );

  useEffect(() => {
    setLiveConnected(false);
    setBookings([]);
    setPatients([]);
    setReady(false);
    setLoading(true);
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
      setBookingTick((n) => n + 1);
      void refresh({ soft: true, force: true });
    }, 400);
  }

  useProctoLiveSocket(
    practiceId,
    (event) => {
      if (!event || typeof event !== "object" || !("event" in event)) return;
      setOpsTick((n) => n + 1);

      if (event.event === "conversation_updated") {
        setConversationTick((n) => n + 1);
        return;
      }
      if (event.event === "payment_updated") return;

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

      setBookingTick((n) => n + 1);
      setBookings((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          String(event.event),
          incoming,
        );
        const filtered = next.filter((b) =>
          matchesProvider(b, selfProviderId),
        );
        if (needsRefresh || event.event === "booking_created") {
          scheduleSoftRefresh();
        }
        return filtered;
      });
    },
    scheduleSoftRefresh,
    () => setLiveConnected(true),
    () => setLiveConnected(false),
  );

  const patchBooking = useCallback(
    (id: string, patch: Partial<BookingRow>) => {
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      );
    },
    [],
  );

  const bookingsOnDate = useCallback(
    (dateIso: string) =>
      bookings.filter((b) => bookingDayKey(b) === dateIso.slice(0, 10)),
    [bookings],
  );

  const bookingsInRange = useCallback(
    (from: string, to: string) =>
      bookings.filter((b) => {
        const d = bookingDayKey(b);
        return d >= from && d <= to;
      }),
    [bookings],
  );

  const value = useMemo(
    (): PracticeLiveValue => ({
      bookings,
      patients,
      loading,
      ready,
      liveConnected,
      error,
      bookingTick,
      conversationTick,
      opsTick,
      refresh,
      patchBooking,
      bookingsOnDate,
      bookingsInRange,
    }),
    [
      bookings,
      patients,
      loading,
      ready,
      liveConnected,
      error,
      bookingTick,
      conversationTick,
      opsTick,
      refresh,
      patchBooking,
      bookingsOnDate,
      bookingsInRange,
    ],
  );

  return (
    <PracticeLiveContext.Provider value={value}>
      {children}
    </PracticeLiveContext.Provider>
  );
}

export function usePracticeLive() {
  const ctx = useContext(PracticeLiveContext);
  if (!ctx) {
    throw new Error("usePracticeLive must be used within PracticeLiveProvider");
  }
  return ctx;
}

export function usePracticeLiveOptional() {
  return useContext(PracticeLiveContext);
}

/** Soft-refresh local screen data when the shared practice socket signals. */
export function usePracticeLiveRefresh(
  onSoft: () => void,
  opts?: {
    bookings?: boolean;
    conversations?: boolean;
    ops?: boolean;
  },
) {
  const live = usePracticeLive();
  const watchBookings = opts?.bookings !== false;
  const watchConversations = Boolean(opts?.conversations);
  const watchOps = Boolean(opts?.ops);
  const onSoftRef = useRef(onSoft);
  onSoftRef.current = onSoft;

  useEffect(() => {
    if (!watchBookings) return;
    if (live.bookingTick === 0) return;
    onSoftRef.current();
  }, [live.bookingTick, watchBookings]);

  useEffect(() => {
    if (!watchConversations) return;
    if (live.conversationTick === 0) return;
    onSoftRef.current();
  }, [live.conversationTick, watchConversations]);

  useEffect(() => {
    if (!watchOps) return;
    if (live.opsTick === 0) return;
    onSoftRef.current();
  }, [live.opsTick, watchOps]);

  return live;
}

/** Prefer shared live list row; fall back to local patch helper. */
export function useLivePracticeBooking(bookingId: string | undefined) {
  const live = usePracticeLiveOptional();
  const fromList = live?.bookings.find((b) => b.id === bookingId) ?? null;

  return {
    booking: fromList,
    liveConnected: live?.liveConnected ?? false,
    refresh: live?.refresh,
    applyIncoming: (incoming: Record<string, unknown>) => {
      if (!live || !bookingId) return;
      live.patchBooking(
        bookingId,
        patchBookingFields({ id: bookingId }, incoming) as Partial<BookingRow>,
      );
    },
  };
}
