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
import {
  fullBookingRange,
  getCachedBookings,
  getCachedPatients,
  nearBookingRange,
  setCachedBookings,
  setCachedPatients,
  takeBootstrapSeed,
  waitForBootstrapSeed,
} from "@/lib/dataCache";
import {
  applyLiveBookingEvent,
  patchBookingFields,
  patchPatientsFromBooking,
} from "@/lib/liveBooking";
import { selfProviderScope, usePractice } from "@/lib/practiceContext";
import {
  fetchPracticeBookings,
  fetchPracticeBootstrap,
  fetchPracticePatients,
} from "@/lib/procto";
import type { BookingRow, PracticePatient } from "@/lib/types";
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

function mergeBookings(prev: BookingRow[], next: BookingRow[]): BookingRow[] {
  if (!prev.length) return next;
  const byId = new Map(prev.map((b) => [b.id, b]));
  for (const b of next) byId.set(b.id, b);
  return Array.from(byId.values());
}

/** One procto practice WS + shared bookings for the doctor Expo shell. */
export function PracticeLiveProvider({ children }: { children: ReactNode }) {
  const { practiceId, membership } = usePractice();
  const selfProviderId = selfProviderScope(membership);

  const cachedBookings = practiceId ? getCachedBookings(practiceId) : null;
  const cachedPatients = practiceId ? getCachedPatients(practiceId) : null;

  const [bookings, setBookings] = useState<BookingRow[]>(
    () => cachedBookings ?? [],
  );
  const [patients, setPatients] = useState<PracticePatient[]>(
    () => cachedPatients ?? [],
  );
  const [loading, setLoading] = useState(() => !cachedBookings);
  const [ready, setReady] = useState(() => Boolean(cachedBookings));
  const [liveConnected, setLiveConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingTick, setBookingTick] = useState(0);
  const [conversationTick, setConversationTick] = useState(0);
  const [opsTick, setOpsTick] = useState(0);

  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoftAt = useRef(0);
  const loadGen = useRef(0);
  const expandedRange = useRef(false);

  const refresh = useCallback(
    async (opts?: {
      soft?: boolean;
      force?: boolean;
      /** Near window first; full ±90d expand in background. */
      expand?: boolean;
    }) => {
      if (!practiceId) return;
      const soft = Boolean(opts?.soft);
      const expand = Boolean(opts?.expand);
      const gen = ++loadGen.current;
      if (!soft) {
        setLoading(true);
        setError(null);
      }

      const range = expand ? fullBookingRange() : nearBookingRange();
      let shouldExpand = false;

      try {
        // Prefer bootstrap for a single round-trip.
        const boot = await fetchPracticeBootstrap({
          from: range.from,
          to: range.to,
          practiceId,
        });
        if (gen !== loadGen.current) return;

        if (boot.status === "successful" && boot.data) {
          const nextBookings = Array.isArray(boot.data.bookings)
            ? (boot.data.bookings as BookingRow[])
            : [];
          const nextPatients = Array.isArray(boot.data.patients)
            ? (boot.data.patients as PracticePatient[])
            : [];
          setBookings((prev) =>
            expand ? mergeBookings(prev, nextBookings) : nextBookings,
          );
          if (nextPatients.length || !soft) setPatients(nextPatients);
          setCachedBookings(
            practiceId,
            expand
              ? mergeBookings(
                  getCachedBookings(practiceId) ?? [],
                  nextBookings,
                )
              : nextBookings,
          );
          if (nextPatients.length || !soft) {
            setCachedPatients(practiceId, nextPatients);
          }
          setError(null);
          shouldExpand = !expand && !expandedRange.current;
        } else {
          // Fallback: parallel list endpoints
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
            const next = bRes.data as BookingRow[];
            setBookings((prev) =>
              expand ? mergeBookings(prev, next) : next,
            );
            setCachedBookings(
              practiceId,
              expand
                ? mergeBookings(getCachedBookings(practiceId) ?? [], next)
                : next,
            );
          } else if (!soft) {
            setBookings([]);
            setError(bRes.message || "Could not load bookings.");
          }
          if (pRes.status === "successful" && Array.isArray(pRes.data)) {
            setPatients(pRes.data as PracticePatient[]);
            setCachedPatients(practiceId, pRes.data as PracticePatient[]);
          }
          shouldExpand = !expand && !expandedRange.current;
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
        // Expand after first paint — do not bump loadGen before ready settles.
        if (shouldExpand && gen === loadGen.current) {
          expandedRange.current = true;
          void refresh({ soft: true, expand: true });
        }
      }
    },
    [practiceId, selfProviderId],
  );

  useEffect(() => {
    let cancelled = false;
    setLiveConnected(false);
    expandedRange.current = false;

    const applySeed = (seed: {
      bookings: BookingRow[];
      patients: PracticePatient[];
    }) => {
      if (cancelled) return;
      setBookings(seed.bookings);
      setPatients(seed.patients);
      setReady(true);
      setLoading(false);
      setError(null);
      expandedRange.current = true;
      void refresh({ soft: true, expand: true });
    };

    const run = async () => {
      if (!practiceId) {
        setBookings([]);
        setPatients([]);
        setReady(false);
        setLoading(false);
        return;
      }

      const immediate = takeBootstrapSeed(practiceId);
      if (immediate) {
        applySeed(immediate);
        return;
      }

      const cachedB = getCachedBookings(practiceId);
      const cachedP = getCachedPatients(practiceId);
      if (cachedB) {
        setBookings(cachedB);
        if (cachedP) setPatients(cachedP);
        setReady(true);
        setLoading(false);
      } else {
        setBookings([]);
        setPatients([]);
        setReady(false);
        setLoading(true);
      }

      // Layout bootstrap may still be in flight — wait so we do not double-hit near window.
      const late = await waitForBootstrapSeed(practiceId);
      if (cancelled) return;
      if (late) {
        applySeed(late);
        return;
      }

      void refresh({ soft: Boolean(cachedB) });
    };

    void run();

    return () => {
      cancelled = true;
      if (softTimer.current) clearTimeout(softTimer.current);
    };
  }, [practiceId, refresh]);

  function scheduleSoftRefresh() {
    const now = Date.now();
    if (now - lastSoftAt.current < 2_000) return;
    if (softTimer.current) clearTimeout(softTimer.current);
    softTimer.current = setTimeout(() => {
      lastSoftAt.current = Date.now();
      setBookingTick((n) => n + 1);
      void refresh({ soft: true, force: true, expand: true });
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
        if (practiceId) setCachedBookings(practiceId, filtered);
        return filtered;
      });
      setPatients((prev) => {
        const next = patchPatientsFromBooking(prev, incoming);
        if (practiceId && next !== prev) setCachedPatients(practiceId, next);
        return next;
      });
    },
    scheduleSoftRefresh,
    () => setLiveConnected(true),
    () => setLiveConnected(false),
  );

  const patchBooking = useCallback(
    (id: string, patch: Partial<BookingRow>) => {
      setBookings((prev) => {
        const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
        if (practiceId) setCachedBookings(practiceId, next);
        return next;
      });
    },
    [practiceId],
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
