import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  PageTitle,
  StatusBadge,
} from "@/components/ui";
import { PremiumAtmosphere, PremiumCard } from "@/components/mobile/PremiumChrome";
import { resolveMediaUrl } from "@/lib/media";
import { usePractice } from "@/lib/practiceContext";
import { fetchPracticeBookings, updateBookingStatus } from "@/lib/procto";
import {
  nextActions,
  whenLabel,
  type BookingRow,
  ymd,
} from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";
import { dockClearance } from "@/lib/dockLayout";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";
import { applyLiveBookingEvent } from "@/lib/liveBooking";
import {
  QUEUE_FILTER_KEYS,
  countQueueStatusFilters,
  matchesQueueStatusFilter,
  queueFilterLabel,
  type QueueStatusFilter,
} from "@/lib/bookingStatus";

export default function QueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [today] = useState(() => ymd(new Date()));
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<QueueStatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const softRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doctors = useMemo(() => {
    const members = membership?.practice.members ?? [];
    return members.filter(
      (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
    );
  }, [membership]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      const res = await fetchPracticeBookings(practiceId, { date: today });
      if (res.status === "successful") {
        setRows((res.data as BookingRow[]) ?? []);
        if (!opts?.silent) setError("");
      } else if (!opts?.silent) {
        setError(res.message || "Could not load appointments");
      }
    },
    [practiceId, today],
  );

  function scheduleSoftRefresh() {
    if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current);
    softRefreshTimer.current = setTimeout(() => {
      void load({ silent: true });
    }, 250);
  }

  useEffect(() => {
    void load();
    return () => {
      if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current);
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
        if (needsRefresh) scheduleSoftRefresh();
        return next;
      });
    },
    () => scheduleSoftRefresh(),
  );

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    const res = await updateBookingStatus(id, status);
    setBusyId(null);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    await load();
  }

  const scoped = useMemo(() => {
    if (providerFilter === "all") return rows;
    return rows.filter(
      (b) =>
        b.provider?.id === providerFilter ||
        (b as { providerId?: string }).providerId === providerFilter,
    );
  }, [rows, providerFilter]);

  const filtered = useMemo(
    () =>
      scoped.filter((b) => matchesQueueStatusFilter(b.status || "", filter)),
    [scoped, filter],
  );

  const counts = useMemo(
    () => countQueueStatusFilters(scoped.map((b) => b.status)),
    [scoped],
  );

  const waiting = counts.waiting;
  const inProgress = counts.in_appointment;
  const booked = counts.booked + counts.accepted;
  const done = counts.done;

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: dockClearance + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Today's queue"
          subtitle={`${today} · clinic-wide board`}
        />

        <View style={styles.metrics}>
          <PremiumCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{waiting}</Text>
            <Text style={styles.metricLabel}>Waiting</Text>
          </PremiumCard>
          <PremiumCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{inProgress}</Text>
            <Text style={styles.metricLabel}>In progress</Text>
          </PremiumCard>
          <PremiumCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{booked}</Text>
            <Text style={styles.metricLabel}>Upcoming</Text>
          </PremiumCard>
          <PremiumCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{done}</Text>
            <Text style={styles.metricLabel}>Finished</Text>
          </PremiumCard>
        </View>

        {doctors.length > 1 ? (
          <View style={styles.chips}>
            <Chip
              label="All doctors"
              active={providerFilter === "all"}
              onPress={() => setProviderFilter("all")}
            />
            {doctors.map((d) => (
              <Chip
                key={d.userId}
                label={d.user.name || "Doctor"}
                active={providerFilter === d.userId}
                onPress={() => setProviderFilter(d.userId)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.chips}>
          {QUEUE_FILTER_KEYS.map((k) => (
            <Chip
              key={k}
              label={queueFilterLabel(k, counts[k])}
              active={filter === k}
              onPress={() => setFilter(k)}
            />
          ))}
        </View>

        <ErrorText text={error} />

        {filtered.length === 0 ? (
          <EmptyState text="No bookings in this filter for today." />
        ) : (
          filtered.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
              style={styles.card}
            >
              <View style={styles.row}>
                <View style={styles.nameRow}>
                  {resolveMediaUrl(b.patient?.imgSrc) ? (
                    <Image
                      source={{ uri: resolveMediaUrl(b.patient?.imgSrc)! }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {(
                          b.patientName ||
                          b.patient?.name ||
                          b.patientPhone ||
                          "?"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.name}>
                    {b.patientName || b.patient?.name || b.patientPhone}
                  </Text>
                </View>
                <StatusBadge status={b.status} />
              </View>
              <Text style={styles.meta}>
                {whenLabel(b)} · {b.mode === "TOKEN_BASED" ? "Token" : "Time"}
                {b.disease ? ` · ${b.disease}` : ""}
                {b.provider?.name ? ` · ${b.provider.name}` : ""}
              </Text>
              {b.notes ? <Text style={styles.notes}>{b.notes}</Text> : null}
              <View style={styles.actions}>
                {nextActions(b.status).map((s) => (
                  <Chip
                    key={s.status}
                    label={s.label}
                    onPress={
                      busyId === b.id
                        ? undefined
                        : () => void setStatus(b.id, s.status)
                    }
                  />
                ))}
                <Chip
                  label="Open visit"
                  onPress={() => router.push(`/(app)/visit/${b.id}`)}
                />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: space.lg,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "45%",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: colors.inkSoft,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.line,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: "#fff" },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 },
  meta: { marginTop: 6, fontSize: 13, color: colors.inkSoft },
  notes: { marginTop: 6, fontSize: 13, color: colors.inkFaint },
  actions: { flexDirection: "row", flexWrap: "wrap", marginTop: space.md },
});
