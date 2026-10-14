import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareGlyph, CareQuickAction, CareStatCard } from "@/components/mobile/careArt";
import { CareWelcome } from "@/components/mobile/CareWelcome";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { ErrorText, Loading, PrimaryButton, Screen } from "@/components/ui";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { bookingWhenMs } from "@/lib/bookingStats";
import { api, getApiUrl } from "@/lib/api";
import {
  getCachedPatientName,
  getCachedPatientPhoto,
  getCachedPractices,
  setCachedPatientName,
  setCachedPatientPhoto,
  setCachedPractices,
} from "@/lib/dataCache";
import { resolveMediaUrl } from "@/lib/media";
import { useCareTheme } from "@/lib/careTheme";
import { contentBottomPad } from "@/lib/dockLayout";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { PRACTICE_TIMEZONE, formatPracticeTime, practiceDayKey } from "@/lib/practiceTime";
import { colors, radii, shadows, space } from "@/lib/theme";
import { isUpcomingStatus, type PatientProfile, type PracticeListItem } from "@/lib/types";

const WELCOME_KEY = "gg.careWelcome";

function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: PRACTICE_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const {
    bookings,
    liveConnected,
    loading: bookingsLoading,
    ready: bookingsReady,
    error: bookingsError,
    refresh: refreshBookings,
  } = usePatientLive();
  const [name, setName] = useState<string | null>(getCachedPatientName);
  const [photo, setPhoto] = useState<string | null>(getCachedPatientPhoto);
  const [practices, setPractices] = useState<PracticeListItem[]>(
    () => getCachedPractices() ?? [],
  );
  const [loading, setLoading] = useState(() => !getCachedPractices());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState<boolean | null>(null);
  const hasData = practices.length > 0 || bookings.length > 0;
  const loadGen = useRef(0);

  async function loadPractices(opts?: { soft?: boolean; force?: boolean }) {
    const soft = Boolean(opts?.soft);
    if (!opts?.force && soft) {
      const cachedP = getCachedPractices();
      if (cachedP) {
        setPractices(cachedP);
        setLoading(false);
        return;
      }
    }
    const gen = ++loadGen.current;
    if (!soft) {
      setLoading(true);
      setError("");
    }
    const pracRes = await api<PracticeListItem[]>("/procto/practices");
    if (gen !== loadGen.current) return;
    if (pracRes.status === "successful" && Array.isArray(pracRes.data)) {
      setPractices(pracRes.data);
      setCachedPractices(pracRes.data);
    } else if (!soft) {
      setError(`${pracRes.message || "Could not load clinics"} (API: ${getApiUrl()})`);
    }
    if (!soft) setLoading(false);
  }

  async function loadProfile() {
    const res = await api<PatientProfile>("/patient/profile");
    if (res.status !== "successful") return;
    const profile = (res.data || res) as PatientProfile;
    const full = profile?.name?.trim();
    if (full) {
      setCachedPatientName(full);
      setName(full);
    }
    const uri = resolveMediaUrl(profile?.img_src ?? profile?.imgSrc);
    setCachedPatientPhoto(uri);
    setPhoto(uri);
  }

  useEffect(() => {
    void SecureStore.getItemAsync(WELCOME_KEY).then((v) => setWelcome(v !== "1"));
  }, []);

  async function dismissWelcome(href?: string) {
    await SecureStore.setItemAsync(WELCOME_KEY, "1");
    setWelcome(false);
    if (href) router.push(href as never);
  }

  const todayKey = practiceDayKey(Date.now());
  const todayVisits = useMemo(
    () => bookings.filter((b) => practiceDayKey(bookingWhenMs(b)) === todayKey),
    [bookings, todayKey],
  );
  const upcoming = bookings.filter((b) => isUpcomingStatus(b.status || "")).length;
  const alerts = bookings.filter((b) =>
    ["NO_SHOW", "CANCELED", "CANCELLED"].includes(String(b.status || "").toUpperCase()),
  ).length;

  useFocusEffect(
    useCallback(() => {
      void loadPractices({ soft: true });
      void refreshBookings({ soft: true });
      setPhoto(getCachedPatientPhoto());
      if (getCachedPatientName()) setName(getCachedPatientName());
      else void loadProfile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshBookings]),
  );

  const displayError = error || bookingsError || "";
  const firstName = name?.split(/\s+/)[0];

  if (welcome) {
    return (
      <CareWelcome
        name={firstName}
        onContinue={() => void dismissWelcome()}
        onFocus={(title) => {
          const href =
            title === "Daily Tasks"
              ? "/(app)/record"
              : title === "Patient Care"
                ? "/(app)/doctors"
                : "/(app)/appointments";
          void dismissWelcome(href);
        }}
      />
    );
  }

  if (welcome === null || (loading && !hasData && !refreshing)) return <Loading />;

  return (
    <Screen style={[styles.screen, { backgroundColor: theme.paper }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: contentBottomPad(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void Promise.all([
                loadPractices({ soft: true, force: true }),
                refreshBookings({ soft: true, force: true }),
                loadProfile(),
              ]).finally(() => setRefreshing(false));
            }}
            tintColor={colors.brand}
          />
        }
      >
        <AnimatedView from="fade" style={styles.header}>
          <PressableScale
            onPress={() => router.push("/(app)/profile")}
            accessibilityRole="button"
            accessibilityLabel="Profile"
          >
            <ClinicAvatar
              name={name || "You"}
              uri={photo}
              size={44}
              radius={22}
              backgroundColor={theme.visit}
            />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: theme.muted }]}>{greeting()}</Text>
            <Text style={[styles.hello, { color: theme.ink }]} numberOfLines={1}>
              {firstName || "there"}
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push("/(app)/queries")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={[styles.bell, { backgroundColor: theme.card }]}
          >
            <CareGlyph name="bell" size={18} color={theme.ink} />
            {liveConnected ? <View style={styles.liveDot} /> : null}
          </PressableScale>
        </AnimatedView>

        <View style={styles.grid}>
          <CareStatCard
            label="Today's Visits"
            value={String(todayVisits.length).padStart(2, "0")}
            hint={upcoming ? `${upcoming} upcoming` : "None today"}
            background={theme.visit}
            ink={theme.visitInk}
            glyph="calendar"
            ratio={bookings.length ? todayVisits.length / bookings.length : 0}
            onPress={() => router.push("/(app)/appointments")}
          />
          <CareStatCard
            label="Today's Tasks"
            value={String(upcoming).padStart(2, "0")}
            hint={upcoming ? `${upcoming} pending` : "Nothing pending"}
            background={theme.task}
            ink={theme.taskInk}
            glyph="checklist"
            ratio={bookings.length ? upcoming / bookings.length : 0}
            onPress={() => router.push("/(app)/record")}
          />
          <CareStatCard
            label="Clinics"
            value={String(practices.length).padStart(2, "0")}
            hint="Open to book"
            background={theme.people}
            ink={theme.peopleInk}
            glyph="people"
            ratio={practices.length ? 1 : 0}
            onPress={() => router.push("/(app)/doctors")}
          />
          <CareStatCard
            label="Alerts"
            value={String(alerts).padStart(2, "0")}
            hint={alerts ? "Need a look" : "None waiting"}
            background={theme.alert}
            ink={theme.alertInk}
            glyph="bell"
            ratio={bookings.length ? alerts / bookings.length : 0}
            onPress={() => router.push("/(app)/appointments")}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.ink }]}>Quick Actions</Text>
        <View style={styles.actions}>
          <CareQuickAction label="Start Visit" glyph="bolt" onPress={() => router.push("/(app)/doctors")} />
          <CareQuickAction label="Note" glyph="note" onPress={() => router.push("/(app)/appointments")} />
          <CareQuickAction label="Wellness" glyph="heart" onPress={() => router.push("/(app)/record")} />
          <CareQuickAction label="Clinics" glyph="people" onPress={() => router.push("/(app)/doctors")} />
        </View>

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: theme.ink, marginTop: 8 }]}>Today's Schedule</Text>
          <Text
            onPress={() => router.push("/(app)/appointments")}
            style={[styles.link, { color: theme.muted }]}
          >
            View all
          </Text>
        </View>
        <NextVisit />

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

      </ScrollView>
    </Screen>
  );
}

function NextVisit() {
  const router = useRouter();
  const { theme } = useCareTheme();
  const { bookings } = usePatientLive();
  const next = bookings.find((b) => isUpcomingStatus(b.status || ""));
  const when = next?.slotStart || next?.slot_start;
  const title = next?.provider?.name || next?.providerName || next?.practice?.name || "Clinic visit";
  const detail = next?.disease?.trim() || next?.practice?.specialty || next?.practice?.name || "Home visit";

  if (!next) {
    return (
      <View style={[styles.schedule, { backgroundColor: theme.card }]}>
        <Text style={[styles.visitName, { color: theme.ink }]}>No visit waiting</Text>
        <Text style={[styles.visitMeta, { color: theme.muted, marginTop: 6 }]}>
          Book a clinic and it will show here.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.schedule, { backgroundColor: theme.card }]}>
      <View style={styles.scheduleTop}>
        <View style={[styles.scheduleAvatar, { backgroundColor: theme.visit, alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: theme.visitInk, fontWeight: "700" }}>{title.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.visitName, { color: theme.ink }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.visitMeta, { color: theme.muted }]} numberOfLines={1}>{detail}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.task }]}>
          <Text style={[styles.badgeText, { color: theme.taskInk }]}>Scheduled</Text>
        </View>
      </View>
      <View style={styles.whenRow}>
        <CareGlyph name="calendar" size={14} color={theme.muted} />
        <Text style={[styles.visitMeta, { color: theme.muted, flex: 1 }]} numberOfLines={1}>
          {when ? formatPracticeTime(when) : "Scheduled"}
          {next.location?.address ? `   ${next.location.address}` : ""}
        </Text>
      </View>
      <View style={styles.scheduleActions}>
        <PressableScale
          accessibilityLabel="Open visit"
          onPress={() => router.push(`/(app)/bookings/${next.id}` as never)}
          style={[styles.round, { backgroundColor: theme.paper }]}
        >
          <CareGlyph name="video" size={18} color={theme.ink} />
        </PressableScale>
        <PressableScale
          onPress={() => router.push(`/(app)/bookings/${next.id}` as never)}
          style={[styles.start, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.startText, { color: theme.ink }]}>View visit</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel="Open visit"
          onPress={() => router.push(`/(app)/bookings/${next.id}` as never)}
          style={[styles.round, { backgroundColor: theme.ink }]}
        >
          <CareGlyph name="expand" size={16} color="#fff" />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: space.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.xl,
  },
  greeting: {
    fontSize: 14,
    color: colors.inkSoft,
  },
  hello: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  avatar: {
    borderWidth: 2,
    borderColor: colors.white,
    ...shadows.soft,
  },
  liveDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  errorCard: {
    marginBottom: space.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.lg,
    ...shadows.soft,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  sectionTitle: { marginTop: 22, marginBottom: 12, fontSize: 18, fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { fontSize: 13, fontWeight: "600" },
  schedule: { borderRadius: 22, padding: 14 },
  scheduleTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  scheduleAvatar: { width: 42, height: 42, borderRadius: 21 },
  visitName: { fontSize: 16, fontWeight: "700" },
  visitMeta: { fontSize: 13 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  scheduleActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  start: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  startText: { fontSize: 15, fontWeight: "700" },
  round: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginTop: space.xxl,
  },
  clinics: {
    marginTop: space.md,
    gap: space.lg,
  },
});
