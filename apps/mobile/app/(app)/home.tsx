import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FeaturedClinicCard } from "@/components/mobile/ClinicCards";
import { MobileHomeHeader } from "@/components/mobile/MobileHomeHeader";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { SearchBar } from "@/components/mobile/SearchBar";
import { SpecialtyRow } from "@/components/mobile/SpecialtyRow";
import { ErrorText, Loading, PrimaryButton, Screen } from "@/components/ui";
import { usePatientLiveSocket } from "@/hooks/useLiveSocket";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { api, getApiUrl } from "@/lib/api";
import { getUpcomingBookings } from "@/lib/bookingStats";
import {
  getCachedBookings,
  getCachedPractices,
  setCachedBookings,
  setCachedPractices,
} from "@/lib/dataCache";
import { applyLiveBookingEvent } from "@/lib/liveBooking";
import { colors, shadows, radii, space, type } from "@/lib/theme";
import {
  bookingWhen,
  type PracticeListItem,
  type ProctoBooking,
} from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string | undefined>();
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => getCachedPractices() ?? [],
  );
  const [bookings, setBookings] = useState<ProctoBooking[]>(
    () => getCachedBookings() ?? [],
  );
  const [loading, setLoading] = useState(
    () => !getCachedPractices() && !getCachedBookings(),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const hasData = practices.length > 0 || bookings.length > 0;
  const softRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGen = useRef(0);

  function scheduleSoftRefresh() {
    if (softRefreshTimer.current) clearTimeout(softRefreshTimer.current);
    softRefreshTimer.current = setTimeout(() => {
      void load({ soft: true, bookingsOnly: true });
    }, 250);
  }

  async function load(opts?: {
    soft?: boolean;
    bookingsOnly?: boolean;
    force?: boolean;
  }) {
    const soft = Boolean(opts?.soft);
    const bookingsOnly = Boolean(opts?.bookingsOnly);
    const force = Boolean(opts?.force);

    if (!force && soft) {
      const cachedB = getCachedBookings();
      const cachedP = getCachedPractices();
      if (bookingsOnly && cachedB) {
        setBookings(cachedB);
        return;
      }
      if (!bookingsOnly && cachedB && cachedP) {
        setBookings(cachedB);
        setPractices(cachedP);
        setLoading(false);
        return;
      }
    }

    const gen = ++loadGen.current;
    if (!soft) setLoading(true);
    if (!soft) setError("");

    if (!force && (bookingsOnly || (soft && practices.length > 0))) {
      const bookRes = await api<ProctoBooking[]>("/procto/bookings/mine");
      if (gen !== loadGen.current) return;
      if (bookRes.status === "successful" && Array.isArray(bookRes.data)) {
        setBookings(bookRes.data);
        setCachedBookings(bookRes.data);
      } else if (!soft) {
        setError(
          `${bookRes.message || "Could not load visits"} (API: ${getApiUrl()})`,
        );
      }
      if (!soft) setLoading(false);
      setRefreshing(false);
      return;
    }

    const [pracRes, bookRes] = await Promise.all([
      api<PracticeListItem[]>("/procto/practices"),
      api<ProctoBooking[]>("/procto/bookings/mine"),
    ]);
    if (gen !== loadGen.current) return;

    const failures: string[] = [];
    if (pracRes.status === "successful" && Array.isArray(pracRes.data)) {
      setPractices(pracRes.data);
      setCachedPractices(pracRes.data);
    } else if (!soft) {
      failures.push(pracRes.message || "Could not load clinics");
    }
    if (bookRes.status === "successful" && Array.isArray(bookRes.data)) {
      setBookings(bookRes.data);
      setCachedBookings(bookRes.data);
    } else if (!soft) {
      failures.push(bookRes.message || "Could not load visits");
    }
    if (!soft && failures.length) {
      setError(`${failures[0]} (API: ${getApiUrl()})`);
    }
    if (!soft) setLoading(false);
    setRefreshing(false);
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
      setBookings((prev) => {
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

  const featured = practices[0];
  const upcoming = useMemo(() => getUpcomingBookings(bookings), [bookings]);
  const nextVisit = upcoming[0];

  function goSearch(q?: string) {
    const term = (q ?? specialty ?? search).trim();
    if (term) {
      router.push({
        pathname: "/(app)/doctors",
        params: { q: term },
      });
    } else {
      router.push("/(app)/doctors");
    }
  }

  if (loading && !hasData && !refreshing) return <Loading />;

  return (
    <Screen style={styles.screen}>
      <PremiumAtmosphere />
      <MobileHomeHeader />
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
        {error ? (
          <AnimatedView from="fade" style={styles.errorCard}>
            <ErrorText text={error} />
            <View style={{ marginTop: space.md }}>
              <PrimaryButton
                label="Retry"
                onPress={() => void load()}
                busy={loading}
              />
            </View>
          </AnimatedView>
        ) : null}
        <AnimatedView from="up" delay={40} style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>GlucoGuide Care</Text>
          <Text style={styles.heroTitle}>
            Exceptional care,{"\n"}booked in moments
          </Text>
          <Text style={styles.heroSub}>
            Discover trusted clinics across India — the same network as WhatsApp
            and the web.
          </Text>
          <View style={styles.heroTrust}>
            <View style={styles.trustItem}>
              <Text style={styles.trustValue}>24/7</Text>
              <Text style={styles.trustLabel}>Booking</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Text style={styles.trustValue}>WA</Text>
              <Text style={styles.trustLabel}>Synced</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Text style={styles.trustValue}>₹0</Text>
              <Text style={styles.trustLabel}>App fees</Text>
            </View>
          </View>
          <View style={styles.heroSearch}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              onSubmit={() => goSearch()}
              placeholder="Search clinic, specialty, or city"
              dark
            />
          </View>
        </AnimatedView>

        <AnimatedView from="up" delay={120} style={styles.specialtyWrap}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>Specialties</Text>
          </View>
          <SpecialtyRow
            activeId={specialty}
            onSelect={(q) => {
              setSpecialty(q);
              goSearch(q);
            }}
          />
        </AnimatedView>

        {featured ? (
          <AnimatedView from="up" delay={180} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>Featured clinic</Text>
              <PressableScale onPress={() => router.push("/(app)/doctors")}>
                <Text style={styles.sectionAction}>See all</Text>
              </PressableScale>
            </View>
            <FeaturedClinicCard item={featured} />
          </AnimatedView>
        ) : null}

        {nextVisit ? (
          <AnimatedView from="up" delay={240} style={styles.section}>
            <Text style={styles.sectionLabel}>Upcoming</Text>
            <PressableScale
              style={styles.upcomingCard}
              onPress={() => router.push("/(app)/appointments")}
            >
              <View style={styles.upcomingAccent} />
              <View style={styles.upcomingDate}>
                <Text style={styles.upcomingDay}>
                  {new Date(
                    nextVisit.slotStart ||
                      nextVisit.slot_start ||
                      nextVisit.sessionDate ||
                      nextVisit.session_date ||
                      Date.now(),
                  ).toLocaleDateString("en-IN", { weekday: "short" })}
                </Text>
                <Text style={styles.upcomingNum}>
                  {new Date(
                    nextVisit.slotStart ||
                      nextVisit.slot_start ||
                      nextVisit.sessionDate ||
                      nextVisit.session_date ||
                      Date.now(),
                  ).getDate()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.upcomingTitle} numberOfLines={1}>
                  {nextVisit.practice?.name || "Clinic visit"}
                </Text>
                <Text style={styles.upcomingMeta}>{bookingWhen(nextVisit)}</Text>
              </View>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={colors.inkFaint}
              />
            </PressableScale>
          </AnimatedView>
        ) : null}
        {!nextVisit && !error ? (
          <AnimatedView from="up" delay={240} style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={22} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>Your calendar is clear</Text>
            <Text style={styles.emptyBody}>
              When you book a visit, it will appear here with reminders.
            </Text>
            <PressableScale
              style={styles.emptyBtn}
              onPress={() => router.push("/(app)/doctors")}
            >
              <Text style={styles.emptyBtnText}>Explore clinics</Text>
            </PressableScale>
          </AnimatedView>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingBottom: 140,
  },
  errorCard: {
    marginTop: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.lg,
    ...shadows.soft,
  },
  heroCard: {
    backgroundColor: colors.navy,
    borderRadius: radii.xxl,
    padding: space.xl,
    paddingBottom: space.lg,
    overflow: "hidden",
    ...shadows.float,
  },
  heroEyebrow: {
    ...type.overline,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 12,
  },
  heroTitle: {
    ...type.hero,
    color: colors.white,
  },
  heroSub: {
    marginTop: space.md,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    color: "rgba(255,255,255,0.62)",
    maxWidth: 300,
  },
  heroTrust: {
    marginTop: space.xl,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  trustItem: {
    flex: 1,
    alignItems: "center",
  },
  trustValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.white,
    letterSpacing: -0.2,
  },
  trustLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  trustDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroSearch: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  specialtyWrap: {
    marginTop: space.xxl + space.md,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  sectionLabel: {
    ...type.overline,
    color: colors.inkFaint,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
    letterSpacing: -0.1,
  },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    overflow: "hidden",
    ...shadows.soft,
  },
  upcomingAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  upcomingDate: {
    width: 52,
    alignItems: "center",
    backgroundColor: colors.brandLight,
    borderRadius: radii.md,
    paddingVertical: 10,
    marginLeft: 4,
  },
  upcomingDay: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.brand,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  upcomingNum: {
    fontSize: 22,
    fontWeight: "500",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  upcomingTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  upcomingMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  emptyCard: {
    marginTop: space.xxl,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.xl,
    ...shadows.soft,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 21,
  },
  emptyBtn: {
    marginTop: space.lg,
    alignSelf: "flex-start",
    backgroundColor: colors.navy,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: radii.md,
  },
  emptyBtnText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 13,
    letterSpacing: -0.1,
  },
});
