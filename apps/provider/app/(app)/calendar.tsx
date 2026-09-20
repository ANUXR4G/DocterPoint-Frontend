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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  PageTitle,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui";
import { PremiumAtmosphere, PremiumCard } from "@/components/mobile/PremiumChrome";
import { selfProviderScope, usePractice } from "@/lib/practiceContext";
import { fetchPracticeBookings } from "@/lib/procto";
import { whenLabel, type BookingRow } from "@/lib/types";
import {
  addMonths,
  formatDayTitle,
  formatMonthTitle,
  isSameDay,
  isSameMonth,
  monthGridDays,
  ymd,
} from "@/lib/calendarDates";
import { colors, radii, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";
import { applyLiveBookingEvent } from "@/lib/liveBooking";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function bookingDayKey(b: BookingRow) {
  if (b.sessionDate) return b.sessionDate.slice(0, 10);
  if (b.slotStart) return ymd(new Date(b.slotStart));
  return "";
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const selfProviderId = selfProviderScope(membership);
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grid = useMemo(() => monthGridDays(anchor), [anchor]);
  const from = ymd(grid[0]!);
  const to = ymd(grid[grid.length - 1]!);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      const res = await fetchPracticeBookings(practiceId, {
        from,
        to,
        providerId: selfProviderId,
      });
      if (res.status === "successful") {
        setRows((res.data as BookingRow[]) ?? []);
        if (!opts?.silent) setError("");
      } else if (!opts?.silent) {
        setError(res.message || "Could not load calendar");
      }
    },
    [practiceId, from, to, selfProviderId],
  );

  function scheduleSoftRefresh() {
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
        if (needsRefresh) scheduleSoftRefresh();
        if (!selfProviderId) return next;
        return next.filter(
          (b) =>
            b.provider?.id === selfProviderId ||
            (b as { providerId?: string }).providerId === selfProviderId,
        );
      });
    },
    () => scheduleSoftRefresh(),
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of rows) {
      const key = bookingDayKey(b);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [rows]);

  // If today is empty, jump to the nearest day that has bookings.
  useEffect(() => {
    if (rows.length === 0) return;
    if ((counts.get(selected) || 0) > 0) return;
    const keys = [...counts.keys()].sort();
    const next = keys.find((k) => k >= selected) || keys[0];
    if (next && next !== selected) setSelected(next);
  }, [rows, counts, selected]);

  const dayRows = rows.filter((b) => bookingDayKey(b) === selected);
  const selectedDate = useMemo(() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  }, [selected]);

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
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Calendar"
          subtitle="Month view · tap a day to open visits"
        />

        <View style={styles.chips}>
          <Chip
            label="← Prev"
            onPress={() => setAnchor((a) => addMonths(a, -1))}
          />
          <Chip
            label="Today"
            onPress={() => {
              const now = new Date();
              setAnchor(now);
              setSelected(ymd(now));
            }}
          />
          <Chip
            label="Next →"
            onPress={() => setAnchor((a) => addMonths(a, 1))}
          />
        </View>

        <Text style={styles.monthTitle}>{formatMonthTitle(anchor)}</Text>

        <PremiumCard style={styles.monthCard}>
          <View style={styles.weekHead}>
            {WEEKDAY_LABELS.map((d) => (
              <Text key={d} style={styles.weekHeadText}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {Array.from({ length: Math.ceil(grid.length / 7) }, (_, week) => (
              <View key={week} style={styles.gridRow}>
                {grid.slice(week * 7, week * 7 + 7).map((day) => {
                  const key = ymd(day);
                  const inMonth = isSameMonth(day, anchor);
                  const active = key === selected;
                  const isToday = isSameDay(day, new Date());
                  const n = counts.get(key) || 0;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelected(key)}
                      style={[
                        styles.cell,
                        !inMonth && styles.cellMuted,
                        active && styles.cellActive,
                        isToday && !active && styles.cellToday,
                      ]}
                    >
                      <View style={styles.cellInner}>
                        <Text
                          style={[
                            styles.cellNum,
                            !inMonth && styles.cellNumMuted,
                            active && styles.cellNumActive,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                        {n > 0 ? (
                          <View
                            style={[
                              styles.cellDot,
                              active && styles.cellDotActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.cellCount,
                                active && styles.cellCountActive,
                              ]}
                            >
                              {n}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.cellDotSpacer} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </PremiumCard>

        <ErrorText text={error} />

        <View style={styles.sectionRow}>
          <Text style={styles.section}>{formatDayTitle(selectedDate)}</Text>
          <Text style={styles.sectionCount}>
            {dayRows.length}{" "}
            {dayRows.length === 1 ? "appointment" : "appointments"}
          </Text>
        </View>
        {dayRows.length === 0 ? (
          <EmptyState text="No appointments this day." />
        ) : (
          dayRows.map((b) => (
            <SurfaceCard
              key={b.id}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
            >
              <View style={styles.row}>
                <Text style={styles.name}>
                  {b.patientName || b.patientPhone}
                </Text>
                <StatusBadge status={b.status} />
              </View>
              <Text style={styles.meta}>
                {whenLabel(b)}
                {b.provider?.name ? ` · ${b.provider.name}` : ""}
              </Text>
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: space.md,
    letterSpacing: -0.3,
  },
  monthCard: {
    marginBottom: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  weekHead: {
    flexDirection: "row",
    marginBottom: space.sm,
  },
  weekHeadText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.inkFaint,
  },
  grid: {
    gap: space.xs,
  },
  gridRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    paddingVertical: space.xs,
  },
  cellInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  cellMuted: { opacity: 0.4 },
  cellActive: { backgroundColor: colors.navy },
  cellToday: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  cellNum: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  cellNumMuted: { color: colors.inkFaint },
  cellNumActive: { color: colors.white },
  cellDot: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cellDotActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  cellDotSpacer: {
    height: 16,
  },
  cellCount: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brand,
  },
  cellCountActive: { color: colors.white },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.sm,
    marginTop: space.sm,
  },
  section: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 },
  meta: {
    marginTop: space.sm,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
});
