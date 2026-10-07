import { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareCalendar } from "@/components/mobile/CareCalendar";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import {
  Chip,
  EmptyState,
  ErrorText,
  Loading,
  PageTitle,
  StatusBadge,
} from "@/components/ui";
import { contentBottomPad } from "@/lib/dockLayout";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { isClinicAdminRole, usePractice } from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { updateBookingStatus } from "@/lib/procto";
import { colors, radii, shadows, space } from "@/lib/theme";
import {
  bookingPatientLabel,
  consultationTypeLabel,
  nextActions,
  whenLabel,
  type BookingRow,
  ymd,
} from "@/lib/types";

type ViewMode = "list" | "calendar";
type Scope = "upcoming" | "past" | "all" | "active";

/** Left accent colour — same status map previously used on calendar day cells. */
function statusAccent(status: string) {
  const s = String(status || "").toUpperCase();
  const fg =
    s === "COMPLETED"
      ? colors.ok
      : s === "CANCELED" || s === "CANCELLED"
        ? colors.danger
        : s === "NO_SHOW"
          ? "#7C3AED"
          : s === "IN_PROGRESS"
            ? "#b45309"
            : s === "WAITING" || s === "CHECKED_IN"
              ? colors.brand
              : "#A16207";
  return { borderLeftColor: fg, borderLeftWidth: 4 } as const;
}

function bookingWhenMs(b: BookingRow): number {
  if (b.slotStart) {
    const t = new Date(b.slotStart).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (b.sessionDate) {
    const t = new Date(`${b.sessionDate.slice(0, 10)}T00:00:00`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function isPast(b: BookingRow) {
  const s = String(b.status || "").toUpperCase();
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

function sortBookings(rows: BookingRow[], scope: Scope): BookingRow[] {
  const dir = scope === "upcoming" || scope === "active" ? 1 : -1;
  return [...rows].sort(
    (a, b) => dir * (bookingWhenMs(a) - bookingWhenMs(b)),
  );
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membership } = usePractice();
  const {
    bookings: rows,
    liveConnected,
    loading,
    error: liveError,
    refresh,
  } = usePracticeLive();
  const isStaffOnly = !isClinicAdminRole(membership?.role);
  const [view, setView] = useState<ViewMode>("list");
  const [scope, setScope] = useState<Scope>("upcoming");
  const [localError, setLocalError] = useState("");
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

  const filtered = useMemo(() => {
    const list = rows.filter((b) => {
      if (scope === "all") return true;
      if (scope === "upcoming") return !isPast(b);
      if (scope === "past") return isPast(b);
      if (scope === "active") return isActive(b);
      return true;
    });
    return sortBookings(list, scope);
  }, [rows, scope]);

  if (loading && rows.length === 0 && !refreshing) {
    return <Loading />;
  }

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
        showsVerticalScrollIndicator={false}
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
                ? "Live · list and calendar stay in sync with your visits."
                : "Live · list and calendar stay in sync clinic-wide."
              : isStaffOnly
                ? "Connecting live… · your appointments from web and WhatsApp."
                : "Connecting live… · clinic appointments from web and WhatsApp."
          }
        />

        <View style={styles.viewSwitch}>
          <Chip
            label="List"
            active={view === "list"}
            onPress={() => setView("list")}
          />
          <Chip
            label="Calendar"
            active={view === "calendar"}
            onPress={() => setView("calendar")}
          />
        </View>

        <ErrorText text={localError || liveError || ""} />

        {view === "calendar" ? (
          <CareCalendar
            bookings={rows}
            onOpenBooking={(id) =>
              router.push(`/(app)/visit/${id}` as Href)
            }
          />
        ) : (
          <>
            <View style={styles.chips}>
              {(
                [
                  ["upcoming", "Upcoming"],
                  ["active", "Active"],
                  ["past", "Past"],
                  ["all", "All"],
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

            {filtered.length === 0 ? (
              <EmptyState text="No appointments in this range." />
            ) : (
              filtered.map((b, index) => {
                const name =
                  bookingPatientLabel(b);
                return (
                  <AnimatedView
                    key={b.id}
                    from="up"
                    delay={Math.min(index * 50, 200)}
                  >
                    <PressableScale
                      style={[
                        styles.card,
                        statusAccent(b.status),
                      ]}
                      onPress={() =>
                        router.push(`/(app)/visit/${b.id}` as Href)
                      }
                    >
                      <View style={styles.cardTop}>
                        <Text style={styles.name}>{name}</Text>
                        <StatusBadge status={b.status} />
                      </View>
                      <Text style={styles.when}>{whenLabel(b)}</Text>
                      <Text style={styles.meta}>
                        {[
                          b.provider?.name
                            ? `Dr. ${b.provider.name.replace(/^Dr\.?\s*/i, "")}`
                            : null,
                          b.disease ||
                            consultationTypeLabel(b.consultationType) ||
                            b.mode?.replace(/_/g, " ") ||
                            null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      <View style={styles.actions}>
                        <Text style={styles.viewHint}>Tap for visit →</Text>
                        <View style={styles.actionChips}>
                          {nextActions(b.status).map((a) => (
                            <Chip
                              key={a.status}
                              label={busyId === b.id ? "…" : a.label}
                              disabled={busyId === b.id}
                              onPress={
                                busyId === b.id
                                  ? undefined
                                  : () => void setStatus(b.id, a.status)
                              }
                            />
                          ))}
                        </View>
                      </View>
                    </PressableScale>
                  </AnimatedView>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  viewSwitch: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: space.md,
    gap: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: space.lg,
    gap: 8,
  },
  card: {
    backgroundColor: colors.paperRaised,
    padding: space.xl,
    marginBottom: space.md,
    borderRadius: radii.xl,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: {
    flex: 1,
    fontWeight: "600",
    fontSize: 17,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  when: {
    marginTop: 12,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  actions: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    gap: space.sm,
  },
  viewHint: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
  actionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
