import { useEffect, useMemo, useState } from "react";
import {
  Image,
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
  SurfaceCard,
} from "@/components/ui";
import { PremiumAtmosphere, DashMetric } from "@/components/mobile/PremiumChrome";
import { resolveMediaUrl } from "@/lib/media";
import {
  isClinicAdminRole,
  usePractice,
} from "@/lib/practiceContext";
import { updateBookingStatus } from "@/lib/procto";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import {
  nextActions,
  whenLabel,
  type BookingRow,
  ymd,
} from "@/lib/types";
import { colors, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
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
  const { membership } = usePractice();
  const {
    liveConnected,
    error: liveError,
    refresh,
    bookingsInRange,
  } = usePracticeLive();
  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const [today] = useState(() => ymd(new Date()));
  const rangeTo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return ymd(d);
  }, []);
  const rows = bookingsInRange(today, rangeTo);
  const error = liveError || "";
  const [localError, setLocalError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<QueueStatusFilter>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const doctors = useMemo(() => {
    if (!isClinicAdmin) return [];
    const members = membership?.practice.members ?? [];
    return members.filter(
      (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
    );
  }, [membership, isClinicAdmin]);

  useEffect(() => {
    if (!isClinicAdmin && membership?.userId) {
      setProviderFilter(membership.userId);
    }
  }, [isClinicAdmin, membership?.userId]);

  async function setStatus(id: string, status: string) {
    const current = rows.find((b) => b.id === id)?.status;
    if (
      ["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
        String(current || "").toUpperCase(),
      )
    ) {
      setLocalError("Completed appointments cannot change status.");
      return;
    }
    setBusyId(id);
    const res = await updateBookingStatus(id, status);
    setBusyId(null);
    if (res.status !== "successful") {
      setLocalError(res.message || "Update failed");
      return;
    }
    setLocalError("");
    await refresh({ soft: true, force: true });
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
          {
            paddingTop: space.lg,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh({ soft: true, force: true });
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Today's queue"
          subtitle={
            liveConnected
              ? isClinicAdmin
                ? `${today} → ${rangeTo} · Live · clinic-wide`
                : `${today} → ${rangeTo} · Live · your appointments`
              : isClinicAdmin
                ? `${today} → ${rangeTo} · Connecting…`
                : `${today} → ${rangeTo} · Connecting…`
          }
        />

        <View style={styles.metrics}>
          <DashMetric
            label="Waiting"
            value={waiting}
            tone="amber"
            style={styles.metricCard}
          />
          <DashMetric
            label="In progress"
            value={inProgress}
            tone="teal"
            style={styles.metricCard}
          />
          <DashMetric
            label="Upcoming"
            value={booked}
            tone="blue"
            style={styles.metricCard}
          />
          <DashMetric
            label="Finished"
            value={done}
            tone="emerald"
            style={styles.metricCard}
          />
        </View>

        {isClinicAdmin && doctors.length > 1 ? (
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

        <ErrorText text={localError || error} />

        {filtered.length === 0 ? (
          <EmptyState text="No bookings in this filter for the next 7 days." />
        ) : (
          filtered.map((b) => (
            <SurfaceCard
              key={b.id}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
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
            </SurfaceCard>
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
    gap: space.md,
    marginBottom: space.lg,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 108,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.line,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandLight,
  },
  avatarInitial: { fontSize: 15, fontWeight: "700", color: colors.brand },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 },
  meta: {
    marginTop: space.sm,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  notes: {
    marginTop: space.xs,
    fontSize: 13,
    color: colors.inkFaint,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
});
