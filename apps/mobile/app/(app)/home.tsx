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
import { PatientDashboard } from "@/components/mobile/PatientDashboard";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { SearchBar } from "@/components/mobile/SearchBar";
import { SpecialtyRow } from "@/components/mobile/SpecialtyRow";
import { ErrorText, Loading, PrimaryButton, Screen } from "@/components/ui";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { api, getApiUrl } from "@/lib/api";
import { getUpcomingBookings } from "@/lib/bookingStats";
import {
  getCachedPractices,
  setCachedPractices,
} from "@/lib/dataCache";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { colors, shadows, radii, space, type } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

export default function HomeScreen() {
  const router = useRouter();
  const {
    bookings,
    liveConnected,
    loading: bookingsLoading,
    ready: bookingsReady,
    error: bookingsError,
    refresh: refreshBookings,
  } = usePatientLive();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState<string | undefined>();
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => getCachedPractices() ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedPractices());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const hasData = practices.length > 0 || bookings.length > 0;
  const loadGen = useRef(0);

  async function loadPractices(opts?: { soft?: boolean; force?: boolean }) {
    const soft = Boolean(opts?.soft);
    const force = Boolean(opts?.force);

    if (!force && soft) {
      const cachedP = getCachedPractices();
      if (cachedP) {
        setPractices(cachedP);
        setLoading(false);
        return;
      }
    }

    const gen = ++loadGen.current;
    if (!soft) setLoading(true);
    if (!soft) setError("");

    const pracRes = await api<PracticeListItem[]>("/procto/practices");
    if (gen !== loadGen.current) return;

    if (pracRes.status === "successful" && Array.isArray(pracRes.data)) {
      setPractices(pracRes.data);
      setCachedPractices(pracRes.data);
    } else if (!soft) {
      setError(
        `${pracRes.message || "Could not load clinics"} (API: ${getApiUrl()})`,
      );
    }
    if (!soft) setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      void loadPractices({ soft: true });
      void refreshBookings({ soft: true });
    }, [refreshBookings]),
  );

  const featured = practices[0];
  const upcoming = useMemo(() => getUpcomingBookings(bookings), [bookings]);
  const nextVisit = upcoming[0];
  const displayError = error || bookingsError || "";

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
      <MobileHomeHeader liveConnected={liveConnected} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void Promise.all([
                loadPractices({ soft: true, force: true }),
                refreshBookings({ soft: true, force: true }),
              ]).finally(() => setRefreshing(false));
            }}
            tintColor={colors.brand}
          />
        }
      >
        {displayError ? (
          <AnimatedView from="fade" style={styles.errorCard}>
            <ErrorText text={displayError} />
            <View style={{ marginTop: space.md }}>
              <PrimaryButton
                label="Retry"
                onPress={() => {
                  void loadPractices();
                  void refreshBookings();
                }}
                busy={loading || bookingsLoading}
              />
            </View>
          </AnimatedView>
        ) : null}

        <PatientDashboard
          bookings={bookings}
          loading={bookingsLoading || !bookingsReady}
        />

        {!nextVisit && !displayError && bookingsReady ? (
          <AnimatedView from="up" delay={140} style={styles.emptyCard}>
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

        <AnimatedView from="up" delay={40} style={[styles.heroCard, styles.heroGap]}>

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
  heroGap: {
    marginTop: space.xxl,
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
  emptyCard: {
    marginTop: space.xl,
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
