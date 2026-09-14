import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CareCalendar } from "@/components/mobile/CareCalendar";
import {
  Chip,
  EmptyState,
  ErrorText,
  Loading,
  PageTitle,
  Screen,
} from "@/components/ui";
import { usePatientLiveSocket } from "@/hooks/useLiveSocket";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { api, getApiUrl } from "@/lib/api";
import { getCachedBookings, setCachedBookings } from "@/lib/dataCache";
import { applyLiveBookingEvent } from "@/lib/liveBooking";
import { colors, shadows, radii, space } from "@/lib/theme";
import {
  bookingWhen,
  isPastStatus,
  isUpcomingStatus,
  type ProctoBooking,
} from "@/lib/types";

function statusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS") return { bg: colors.amberLight, fg: "#b45309" };
  if (s === "COMPLETED") return { bg: colors.emeraldLight, fg: colors.success };
  if (s === "ACCEPTED" || s === "CONFIRMED")
    return { bg: colors.brandMist, fg: colors.brand };
  if (s === "WAITING" || s === "CHECKED_IN")
    return { bg: colors.brandLight, fg: colors.brand };
  if (s === "CANCELED" || s === "CANCELLED" || s === "NO_SHOW")
    return { bg: colors.brandMist, fg: colors.inkSoft };
  return { bg: colors.brandLight, fg: colors.inkSoft };
}

type ViewMode = "list" | "calendar";

export default function AppointmentsScreen() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("list");
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [items, setItems] = useState<ProctoBooking[]>(
    () => getCachedBookings() ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedBookings());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const softRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGen = useRef(0);

  function scheduleSoftRefresh() {
    if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current);
    softRefreshTimer.current = setTimeout(() => {
      void load({ soft: true });
    }, 250);
  }

  async function load(opts?: { soft?: boolean; force?: boolean }) {
    const soft = Boolean(opts?.soft);
    const force = Boolean(opts?.force);

    if (!force && soft) {
      const cached = getCachedBookings();
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
    }

    const gen = ++loadGen.current;
    if (!soft) setLoading(true);
    if (!soft) setError("");
    const res = await api<ProctoBooking[]>("/procto/bookings/mine");
    if (gen !== loadGen.current) return;
    if (!soft) setLoading(false);
    setRefreshing(false);
    if (res.status !== "successful") {
      if (!soft) {
        setError(
          `${res.message || "Failed to load visits"} (API: ${getApiUrl()})`,
        );
      }
      return;
    }
    const next = Array.isArray(res.data) ? res.data : [];
    setItems(next);
    setCachedBookings(next);
  }

  useFocusEffect(
    useCallback(() => {
      void load({ soft: true });
      return () => {
        if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current);
      };
    }, []),
  );

  usePatientLiveSocket(
    true,
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
      setItems((prev) => {
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
    () => scheduleSoftRefresh(),
  );

  const filtered = items.filter((b) => {
    if (scope === "upcoming") return isUpcomingStatus(b.status);
    if (scope === "past") return isPastStatus(b.status);
    return true;
  });

  function cancel(id: string) {
    Alert.alert("Cancel visit?", "This cannot be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel visit",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          const res = await api(`/procto/bookings/${id}/cancel`, {
            method: "PATCH",
            body: JSON.stringify({}),
          });
          setBusyId(null);
          if (res.status !== "successful") {
            setError(res.message || "Cancel failed");
            return;
          }
          await load({ soft: true });
        },
      },
    ]);
  }

  if (loading && items.length === 0 && !refreshing) return <Loading />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ soft: true, force: true });
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow="Schedule"
          title="My visits"
          subtitle="Switch between list and calendar. Bookings from web and WhatsApp show here."
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

        <ErrorText text={error} />

        {view === "calendar" ? (
          <CareCalendar
            bookings={items}
            onOpenBooking={(id) =>
              router.push(`/(app)/bookings/${id}` as Href)
            }
          />
        ) : (
          <>
            <View style={styles.chips}>
              {(
                [
                  ["upcoming", "Upcoming"],
                  ["past", "Past"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  active={scope === value}
                  onPress={() => setScope(value)}
                />
              ))}
            </View>

            {filtered.length === 0 ? (
              <EmptyState text="No visits here yet. Find a clinic or book on WhatsApp." />
            ) : (
              filtered.map((item, index) => {
                const canCancel = [
                  "SCHEDULED",
                  "REQUESTED",
                  "ACCEPTED",
                  "BOOKED",
                  "CONFIRMED",
                ].includes((item.status || "").toUpperCase());
                const isCompleted =
                  (item.status || "").toUpperCase() === "COMPLETED";
                const provider =
                  item.provider?.name || item.providerName || "Doctor";
                const tone = statusTone(item.status);
                return (
                  <AnimatedView
                    key={item.id}
                    from="up"
                    delay={Math.min(index * 50, 200)}
                  >
                    <PressableScale
                      style={styles.card}
                      onPress={() =>
                        router.push(`/(app)/bookings/${item.id}` as Href)
                      }
                    >
                      <View style={styles.cardTop}>
                        <Text style={styles.name}>
                          {item.practice?.name || "Clinic"}
                        </Text>
                        <View
                          style={[styles.badge, { backgroundColor: tone.bg }]}
                        >
                          <Text style={[styles.badgeText, { color: tone.fg }]}>
                            {(item.status || "").replace(/_/g, " ")}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.meta}>
                        {provider}
                        {item.practice?.specialty
                          ? ` · ${item.practice.specialty}`
                          : ""}
                        {item.location?.city ? ` · ${item.location.city}` : ""}
                      </Text>
                      <Text style={styles.when}>{bookingWhen(item)}</Text>
                      {item.channel === "WHATSAPP_AI" ||
                      item.practice?.consultationFee != null ? (
                        <Text style={styles.status}>
                          {item.channel === "WHATSAPP_AI" ? "WhatsApp" : ""}
                          {item.channel === "WHATSAPP_AI" &&
                          item.practice?.consultationFee != null
                            ? " · "
                            : ""}
                          {item.practice?.consultationFee != null
                            ? `₹${item.practice.consultationFee}`
                            : ""}
                        </Text>
                      ) : null}
                      <View style={styles.actions}>
                        {isCompleted ? (
                          <Text style={styles.reviewHint}>
                            Tap to leave a review →
                          </Text>
                        ) : (
                          <Text style={styles.viewHint}>Tap for details →</Text>
                        )}
                        {canCancel ? (
                          <PressableScale
                            style={styles.cancelBtn}
                            disabled={busyId === item.id}
                            onPress={() => cancel(item.id)}
                          >
                            <Text style={styles.cancelText}>
                              {busyId === item.id ? "…" : "Cancel"}
                            </Text>
                          </PressableScale>
                        ) : null}
                      </View>
                    </PressableScale>
                  </AnimatedView>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 130 },
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
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meta: { marginTop: 8, color: colors.inkSoft, fontSize: 13 },
  when: {
    marginTop: 12,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  status: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500",
    color: colors.inkFaint,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
  },
  reviewHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
  viewHint: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.roseLight,
  },
  cancelText: { color: colors.danger, fontWeight: "600", fontSize: 13 },
});
