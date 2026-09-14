import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Chip,
  EmptyState,
  ErrorText,
  PageTitle,
  StatusBadge,
} from "@/components/ui";
import { usePractice } from "@/lib/practiceContext";
import { fetchPracticeBookings, updateBookingStatus } from "@/lib/procto";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";
import { applyLiveBookingEvent } from "@/lib/liveBooking";
import {
  addDays,
  nextActions,
  whenLabel,
  type BookingRow,
  ymd,
} from "@/lib/types";
import { colors, space } from "@/lib/theme";

type Scope = "all" | "upcoming" | "past" | "active" | "done";

function addDaysYmd(base: Date, n: number) {
  return ymd(addDays(base, n));
}

function isPast(b: BookingRow) {
  const s = String(b.status || "").toUpperCase();
  // Terminal statuses are past. Open statuses stay "upcoming" even if the
  // slot time already passed (overdue) — matches clinic dashboard expectations.
  if (["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(s)) {
    return true;
  }
  if (
    [
      "SCHEDULED",
      "REQUESTED",
      "BOOKED",
      "WAITING",
      "CHECKED_IN",
      "IN_PROGRESS",
      "ACCEPTED",
      "CONFIRMED",
    ].includes(s)
  ) {
    return false;
  }
  if (b.slotStart) return new Date(b.slotStart).getTime() < Date.now();
  if (b.sessionDate) {
    return b.sessionDate.slice(0, 10) < ymd(new Date());
  }
  return false;
}

function isActive(b: BookingRow) {
  const s = String(b.status || "").toUpperCase();
  return ["WAITING", "CHECKED_IN", "IN_PROGRESS", "ACCEPTED", "CONFIRMED"].includes(
    s,
  );
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const { practiceId, membership } = usePractice();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMemo(() => {
    const today = new Date();
    return {
      from: addDaysYmd(today, -90),
      to: addDaysYmd(today, 90),
    };
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      // Match web DoctorAppointmentsList: practice-wide ±90 days, no providerId.
      const res = await fetchPracticeBookings(practiceId, {
        from: range.from,
        to: range.to,
      });
      setRefreshing(false);
      if (res.status === "successful") {
        setRows((res.data as BookingRow[]) ?? []);
        if (!opts?.silent) setError("");
      } else if (!opts?.silent) {
        setError(res.message || "Could not load appointments");
      }
    },
    [practiceId, range.from, range.to],
  );

  function scheduleSoft() {
    if (softTimer.current) clearTimeout(softTimer.current);
    softTimer.current = setTimeout(() => void load({ silent: true }), 250);
  }

  useEffect(() => {
    void load();
    return () => {
      if (softTimer.current) clearTimeout(softTimer.current);
    };
  }, [load]);

  useProctoLiveSocket(
    practiceId,
    (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        !("event" in event) ||
        (event.event !== "booking_created" &&
          event.event !== "booking_updated")
      ) {
        return;
      }
      const incoming =
        "booking" in event
          ? (event.booking as Record<string, unknown>)
          : undefined;
      setRows((prev) => {
        const { next, needsRefresh } = applyLiveBookingEvent(
          prev,
          String(event.event),
          incoming,
        );
        if (needsRefresh) scheduleSoft();
        return next;
      });
    },
    () => scheduleSoft(),
  );

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    const res = await updateBookingStatus(id, status);
    setBusyId(null);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    await load({ silent: true });
  }

  const filtered = rows.filter((b) => {
    if (scope === "all") return true;
    if (scope === "upcoming") return !isPast(b);
    if (scope === "past") return isPast(b);
    if (scope === "active") return isActive(b);
    if (scope === "done") {
      const s = String(b.status || "").toUpperCase();
      return s === "COMPLETED" || s === "NO_SHOW";
    }
    return true;
  });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.brand}
        />
      }
    >
      <PageTitle
        eyebrow={membership?.practice.name}
        title="Appointments"
        subtitle={`±90 days · same list as the web dashboard`}
      />

      <View style={styles.chips}>
        {(
          [
            ["all", "All"],
            ["upcoming", "Upcoming"],
            ["active", "Active"],
            ["past", "Past"],
            ["done", "Done"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            label={label}
            active={scope === id}
            onPress={() => setScope(id)}
          />
        ))}
      </View>

      <ErrorText text={error} />

      {filtered.length === 0 ? (
        <EmptyState text="No appointments in this range." />
      ) : (
        filtered.map((b) => {
          const name =
            b.patientName || b.patient?.name || b.patientPhone || "Patient";
          return (
            <Pressable
              key={b.id}
              style={styles.card}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.name}>{name}</Text>
                <StatusBadge status={b.status} />
              </View>
              <Text style={styles.meta}>{whenLabel(b)}</Text>
              <Text style={styles.meta}>
                {b.disease || b.consultationType || b.mode?.replace(/_/g, " ")}
              </Text>
              <View style={styles.chips}>
                {nextActions(b.status).map((a) => (
                  <Chip
                    key={a.status}
                    label={a.label}
                    onPress={
                      busyId === b.id
                        ? undefined
                        : () => void setStatus(b.id, a.status)
                    }
                  />
                ))}
                <Chip
                  label="Open"
                  onPress={() => router.push(`/(app)/visit/${b.id}`)}
                />
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl, paddingBottom: 48 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: space.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: space.lg,
    marginBottom: space.md,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: { fontSize: 13, color: colors.inkSoft, marginBottom: 2 },
});
