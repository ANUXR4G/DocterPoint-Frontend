import { useMemo, useState } from "react";
import {
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
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { isClinicAdminRole, usePractice } from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { updateBookingStatus } from "@/lib/procto";
import {
  consultationTypeLabel,
  nextActions,
  whenLabel,
  type BookingRow,
  ymd,
} from "@/lib/types";
import { colors, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";

type Scope = "all" | "upcoming" | "past" | "active" | "done";

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
  const insets = useSafeAreaInsets();
  const { membership } = usePractice();
  const {
    bookings: rows,
    liveConnected,
    error: liveError,
    refresh,
  } = usePracticeLive();
  const isStaffOnly = !isClinicAdminRole(membership?.role);
  const error = liveError || "";
  const [localError, setLocalError] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
            onRefresh={() => {
              setRefreshing(true);
              void refresh({ soft: true, force: true }).finally(() =>
                setRefreshing(false),
              );
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Appointments"
          subtitle={
            liveConnected
              ? isStaffOnly
                ? "Live · ±90 days · your appointments"
                : "Live · ±90 days · clinic-wide list"
              : isStaffOnly
                ? "Connecting… · ±90 days · your appointments"
                : "Connecting… · ±90 days · clinic-wide list"
          }
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

      <ErrorText text={localError || error} />

      {filtered.length === 0 ? (
        <EmptyState text="No appointments in this range." />
      ) : (
        filtered.map((b) => {
          const name =
            b.patientName || b.patient?.name || b.patientPhone || "Patient";
          return (
            <SurfaceCard
              key={b.id}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.name}>{name}</Text>
                <StatusBadge status={b.status} />
              </View>
              <Text style={styles.meta}>{whenLabel(b)}</Text>
              <Text style={styles.meta}>
                {b.disease ||
                  consultationTypeLabel(b.consultationType) ||
                  b.mode?.replace(/_/g, " ")}
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
            </SurfaceCard>
          );
        })
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: space.xs,
    lineHeight: 18,
  },
});
