import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareCalendar } from "@/components/mobile/CareCalendar";
import { CareGlyph } from "@/components/mobile/careArt";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { EmptyState, ErrorText, Loading, Screen } from "@/components/ui";
import { AnimatedView, PressableScale } from "@/lib/motion";
import {
  bookingStatusLabel,
  bookingWhenMs,
  chiefComplaintOf,
  effectiveBookingStatus,
  isUpcomingBooking,
  sortBookingsByWhen,
} from "@/lib/bookingStats";
import { withDrTitle } from "@/lib/doctorName";
import { useCareTheme } from "@/lib/careTheme";
import { colors } from "@/lib/theme";
import { contentBottomPad, safeTopInset } from "@/lib/dockLayout";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { formatPracticeDate, formatPracticeTime, practiceDayKey } from "@/lib/practiceTime";
import type { ProctoBooking } from "@/lib/types";

type Scope = "all" | "today" | "upcoming" | "past" | "calendar";

const FILTERS: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "calendar", label: "Calendar" },
  { value: "today", label: "Today's Visit" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

function lineColor(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED" || s === "CANCELED" || s === "CANCELLED") return "#3CB87A";
  if (s === "NO_SHOW") return colors.noShow;
  if (s === "IN_PROGRESS" || s === "WAITING" || s === "CHECKED_IN") return "#F5B56A";
  return "#7EB6FF";
}

function stageOf(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED") return { pct: 1, color: "#8FCBB0" };
  if (s === "IN_PROGRESS") return { pct: 0.72, color: "#F5B56A" };
  if (s === "WAITING" || s === "CHECKED_IN") return { pct: 0.58, color: "#F5B56A" };
  if (s === "CONFIRMED" || s === "ACCEPTED") return { pct: 0.42, color: "#F5B56A" };
  if (s === "NO_SHOW") return { pct: 0.16, color: colors.noShow };
  if (s === "CANCELED" || s === "CANCELLED") return { pct: 0.16, color: "#3CB87A" };
  return { pct: 0.28, color: "#F5B56A" };
}

function matchesQuery(item: ProctoBooking, query: string) {
  if (!query) return true;
  const blob = [
    item.practice?.name,
    item.practice?.specialty,
    item.provider?.name,
    item.providerName,
    item.location?.city,
    item.location?.name,
    chiefComplaintOf(item),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(query);
}

export default function AppointmentsScreen() {
  const router = useRouter();
  const { view, at } = useLocalSearchParams<{ view?: string; at?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const {
    bookings: items,
    loading,
    liveConnected,
    error: liveError,
    refresh,
  } = usePatientLive();
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const displayError = liveError || "";

  useEffect(() => {
    if (view === "calendar") setScope("calendar");
    else if (view === "visits") setScope("all");
    else return;
    router.setParams({ view: "", at: "" });
  }, [view, at, router]);

  useFocusEffect(
    useCallback(() => {
      void refresh({ soft: true });
    }, [refresh]),
  );

  const now = Date.now();
  const todayKey = practiceDayKey(now);
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const matched = items.filter((b) => matchesQuery(b, needle));
    if (scope === "calendar") return matched;
    const scoped = matched.filter((b) => {
      if (scope === "today") return practiceDayKey(bookingWhenMs(b)) === todayKey;
      if (scope === "upcoming") return isUpcomingBooking(b, now);
      if (scope === "past") return !isUpcomingBooking(b, now);
      return true;
    });
    if (scope === "all") {
      const upcoming = sortBookingsByWhen(
        scoped.filter((b) => isUpcomingBooking(b, now)),
        "asc",
      );
      const rest = sortBookingsByWhen(
        scoped.filter((b) => !isUpcomingBooking(b, now)),
        "desc",
      );
      return [...upcoming, ...rest];
    }
    return sortBookingsByWhen(scoped, scope === "past" ? "desc" : "asc");
  }, [items, needle, scope, todayKey, now]);

  if (loading && items.length === 0 && !refreshing) return <Loading />;

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeTopInset(insets.top) + 8,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh({ soft: true, force: true }).finally(() => setRefreshing(false));
            }}
            tintColor={theme.visitInk}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.ink }]}>Visits</Text>
          <PressableScale
            onPress={() => router.push("/(app)/queries")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={[styles.bell, { backgroundColor: theme.card }]}
          >
            <CareGlyph name="bell" size={18} color={theme.ink} />
            {liveConnected ? <View style={[styles.liveDot, { backgroundColor: theme.stable }]} /> : null}
          </PressableScale>
        </View>

        <View style={[styles.search, { backgroundColor: theme.card }]}>
          <CareGlyph name="search" size={18} color={theme.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search visits..."
            placeholderTextColor={theme.muted}
            style={[styles.searchInput, { color: theme.ink }]}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((filter) => {
            const on = scope === filter.value;
            return (
              <PressableScale
                key={filter.value}
                onPress={() => setScope(filter.value)}
                style={[styles.chip, { backgroundColor: on ? theme.ink : theme.card }]}
              >
                <Text style={[styles.chipText, { color: on ? "#fff" : theme.ink }]}>
                  {filter.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <ErrorText text={displayError} />

        {scope === "calendar" ? (
          <CareCalendar
            bookings={filtered}
            onOpenBooking={(id) => router.push(`/(app)/bookings/${id}` as Href)}
          />
        ) : filtered.length === 0 ? (
          <EmptyState text="No visits here yet. Find a clinic or book on WhatsApp." />
        ) : (
          <View style={styles.list}>
            {filtered.map((item, index) => {
              const displayStatus = effectiveBookingStatus(item, now);
              const noShow = displayStatus === "NO_SHOW";
              const canceled = displayStatus === "CANCELED" || displayStatus === "CANCELLED";
              const rawName = (item.provider?.name || item.providerName || "Doctor").replace(
                /^dr\.?\s+/i,
                "",
              );
              const provider = withDrTitle(rawName) || "Doctor";
              const when = item.slotStart || item.slot_start;
              const clock = when ? formatPracticeTime(when, "") : "";
              const [hm, period] = clock.split(" ");
              const complaint = chiefComplaintOf(item);
              const subtitle = complaint || "No chief complaint";
              const stage = stageOf(displayStatus);
              const railColor = lineColor(displayStatus);
              const open = () => router.push(`/(app)/bookings/${item.id}` as Href);
              return (
                <AnimatedView
                  key={item.id}
                  from="up"
                  delay={Math.min(index * 40, 200)}
                  style={styles.personHit}
                >
                  <View style={styles.row}>
                    {index < filtered.length - 1 ? (
                      <View style={[styles.segment, { backgroundColor: railColor }]} />
                    ) : null}
                    <View style={styles.rail}>
                      <Text style={[styles.railTime, { color: theme.muted }]}>{hm || "—"}</Text>
                      {period ? (
                        <Text style={[styles.railPeriod, { color: theme.muted }]}>{period}</Text>
                      ) : null}
                      <View style={[styles.dot, { backgroundColor: railColor, borderColor: theme.paper }]} />
                    </View>
                    <View style={[styles.card, { backgroundColor: theme.card }]}>
                      <View style={styles.cardTop}>
                        <View
                          style={[
                            styles.pill,
                            {
                              backgroundColor: noShow
                                ? colors.noShowBg
                                : canceled
                                  ? theme.alert
                                  : theme.task,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.pillDot,
                              {
                                backgroundColor: noShow
                                  ? colors.noShow
                                  : canceled
                                    ? theme.attention
                                    : theme.stable,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.pillText,
                              {
                                color: noShow
                                  ? colors.noShowInk
                                  : canceled
                                    ? theme.alertInk
                                    : theme.taskInk,
                              },
                            ]}
                          >
                            {bookingStatusLabel(displayStatus).toLowerCase()}
                          </Text>
                        </View>
                        <PressableScale
                          onPress={open}
                          accessibilityRole="button"
                          accessibilityLabel="Message clinic"
                          style={[styles.chat, { backgroundColor: theme.paper }]}
                        >
                          <CareGlyph name="chat" size={16} color={theme.muted} />
                        </PressableScale>
                      </View>
                      <Pressable
                        onPress={open}
                        accessibilityRole="button"
                        accessibilityLabel={provider}
                        style={[styles.person, { backgroundColor: theme.paper }]}
                      >
                        <ClinicAvatar
                          name={rawName}
                          size={44}
                          radius={12}
                          backgroundColor={theme.visit}
                          textColor={theme.ink}
                        />
                        <View style={styles.personText}>
                          <Text style={[styles.name, { color: theme.ink }]}>{provider}</Text>
                          <Text style={[styles.meta, { color: theme.muted }]}>{subtitle}</Text>
                        </View>
                        <Text style={[styles.chevron, { color: theme.muted }]}>›</Text>
                      </Pressable>
                      <View style={styles.progressRow}>
                        <Text style={[styles.progressLabel, { color: theme.muted }]}>
                          {formatPracticeDate(when || item.sessionDate || item.session_date, "Visit")}
                        </Text>
                        <Text style={[styles.progressValue, { color: theme.ink }]}>
                          {Math.round(stage.pct * 100)}%
                        </Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: theme.line }]}>
                        <View
                          style={[
                            styles.fill,
                            { width: `${Math.round(stage.pct * 100)}%`, backgroundColor: stage.color },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                </AnimatedView>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  chips: { gap: 8, paddingBottom: 16, paddingRight: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, minWidth: 64, alignItems: "center" },
  chipText: { fontSize: 14, fontWeight: "600" },
  list: { position: "relative" },
  row: { position: "relative", flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  segment: {
    position: "absolute",
    left: 52,
    top: 24,
    bottom: -38,
    width: 3,
    borderRadius: 2,
  },
  rail: { width: 62, paddingTop: 14, alignItems: "flex-end", paddingRight: 16, zIndex: 1 },
  railTime: { fontSize: 12, fontWeight: "500" },
  railPeriod: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  dot: {
    position: "absolute",
    right: 2,
    top: 18,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  card: {
    flex: 1,
    borderRadius: 26,
    padding: 12,
    gap: 10,
    marginLeft: 8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: "500" },
  chat: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  personHit: { alignSelf: "stretch", width: "100%" },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 36,
    paddingVertical: 8,
    width: "100%",
    overflow: "hidden",
  },
  personText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3 },
  meta: { marginTop: 2, fontSize: 13 },
  chevron: {
    position: "absolute",
    right: 12,
    fontSize: 22,
    fontWeight: "400",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  progressLabel: { fontSize: 13, fontWeight: "400" },
  progressValue: { fontSize: 13, fontWeight: "600" },
  track: { height: 6, borderRadius: 999, overflow: "hidden", marginHorizontal: 4, marginBottom: 4 },
  fill: { height: 6, borderRadius: 999 },
});
