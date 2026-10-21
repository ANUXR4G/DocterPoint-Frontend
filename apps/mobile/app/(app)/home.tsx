import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareGlyph, CareQuickAction, CareStatCard } from "@/components/mobile/careArt";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { ErrorText, Loading, PrimaryButton, Screen } from "@/components/ui";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { bookingWhenMs, chiefComplaintOf, getUpcomingBookings, nextVisitLabel } from "@/lib/bookingStats";
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
import { contentBottomPad, safeTopInset } from "@/lib/dockLayout";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { PRACTICE_TIMEZONE, formatPracticeDate, practiceDayKey } from "@/lib/practiceTime";
import { colors, radii, shadows, space } from "@/lib/theme";
import { isUpcomingStatus, type PatientProfile, type PracticeListItem } from "@/lib/types";

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
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([]);
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

  const todayKey = practiceDayKey(Date.now());
  const todayVisits = useMemo(
    () => bookings.filter((b) => practiceDayKey(bookingWhenMs(b)) === todayKey),
    [bookings, todayKey],
  );
  const inProgressToday = todayVisits.filter(
    (b) => String(b.status || "").toUpperCase() === "IN_PROGRESS",
  ).length;
  const upcoming = useMemo(() => getUpcomingBookings(bookings), [bookings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const filtered = await api<{ id: string; name: string }[]>(
        "/procto/specialties?has_doctors=true",
      );
      let rows =
        filtered.status === "successful" && Array.isArray(filtered.data) ? filtered.data : [];
      if (!rows.length) {
        const all = await api<{ id: string; name: string }[]>("/procto/specialties");
        if (all.status === "successful" && Array.isArray(all.data)) rows = all.data;
      }
      if (!cancelled) setSpecialties(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    const add = (name: string, id?: string) => {
      const label = name.trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) return;
      seen.add(key);
      list.push({ id: id || label, name: label });
    };
    for (const item of specialties) add(item.name, item.id);
    for (const practice of practices) {
      if (practice.specialty) add(practice.specialty);
      for (const name of practice.specialties ?? []) add(name);
    }
    return list;
  }, [specialties, practices]);

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

  if (loading && !hasData && !refreshing) return <Loading />;

  return (
    <Screen style={[styles.screen, { backgroundColor: theme.paper }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeTopInset(insets.top) + 12,
            paddingBottom: contentBottomPad(insets.bottom),
            paddingLeft: 18 + insets.left,
            paddingRight: 18 + insets.right,
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
              {name || "there"}
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push("/(app)/queries")}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={[styles.bell, { backgroundColor: theme.card, borderRadius: 14 }]}
          >
            <CareGlyph name="bell" size={18} color={theme.ink} />
            {liveConnected ? <View style={styles.liveDot} /> : null}
          </PressableScale>
        </AnimatedView>

        <View style={styles.rows}>
          <CareStatCard
            fullWidth
            label="Today's visit"
            value={String(todayVisits.length).padStart(2, "0")}
            hint={
              inProgressToday
                ? `${inProgressToday} in progress`
                : todayVisits.length
                  ? "Scheduled today"
                  : "None today"
            }
            background="#F5C284"
            ink="#111111"
            glyph="calendar"
            icon={require("@/assets/care/visit.png")}
            variant="dashes"
            track="#F6D7BE"
            ratio={todayVisits.length ? inProgressToday / todayVisits.length : 0}
            onPress={() => router.push("/(app)/appointments")}
          />
          <CareStatCard
            fullWidth
            label="Upcoming appointments"
            value={String(upcoming.length).padStart(2, "0")}
            hint={upcoming.length ? nextVisitLabel(upcoming[0]) : "None scheduled"}
            background="#B6DDC2"
            ink="#111111"
            glyph="checklist"
            icon={require("@/assets/care/upcoming.png")}
            variant="dots"
            track="#D7F3E4"
            ratio={bookings.length ? upcoming.length / bookings.length : 0}
            onPress={() => router.push("/(app)/appointments")}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.ink }]}>Quick Actions</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.actions}
        >
          {categories.map((item) => (
            <CareQuickAction
              key={item.id}
              label={item.name}
              glyph="stethoscope"
              onPress={() =>
                router.push({
                  pathname: "/(app)/doctors",
                  params: { specialty: item.name },
                } as never)
              }
            />
          ))}
        </ScrollView>

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

function clinicDay(booking: Parameters<typeof bookingWhenMs>[0]) {
  const ms = bookingWhenMs(booking);
  if (!ms) return "Scheduled";
  const key = practiceDayKey(ms);
  if (key === practiceDayKey(Date.now())) return "Today";
  if (key === practiceDayKey(Date.now() + 86_400_000)) return "Tomorrow";
  return formatPracticeDate(new Date(ms));
}

/** Clinic clock as separate pieces so Android does not swallow the digits. */
function clinicClock(slot: string | null | undefined) {
  if (!slot) return null;
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const hour24 = shifted.getUTCHours();
  return {
    hour: String(hour24 % 12 || 12),
    minute: String(shifted.getUTCMinutes()).padStart(2, "0"),
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function NextVisit() {
  const router = useRouter();
  const { theme } = useCareTheme();
  const { bookings } = usePatientLive();
  const next = bookings.find((b) => isUpcomingStatus(b.status || ""));
  const clock = clinicClock(next?.slotStart || next?.slot_start);
  const title = next?.provider?.name || next?.providerName || next?.practice?.name || "Clinic visit";

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

  const detail = chiefComplaintOf(next) || "No chief complaint";

  return (
    <View style={[styles.schedule, { backgroundColor: theme.card }]}>
      <View style={styles.scheduleTop}>
        <View style={[styles.scheduleAvatar, { backgroundColor: theme.visit, alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: theme.visitInk, fontWeight: "700" }}>{title.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.visitName, { color: theme.ink }]}>{title}</Text>
          <Text style={styles.clockText}>{detail}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={[styles.badge, { backgroundColor: theme.task }]}>
          <View style={[styles.badgeDot, { backgroundColor: theme.taskInk }]} />
          <Text style={[styles.badgeText, { color: theme.taskInk }]}>Scheduled</Text>
        </View>
        {next ? (
          <View style={styles.metaItem}>
            <CareGlyph name="calendar" size={14} color="#000000" />
            <Text style={styles.clockText}>{clinicDay(next)}</Text>
          </View>
        ) : null}
        {clock ? (
          <View style={styles.metaItem}>
            <CareGlyph name="clock" size={14} color="#000000" />
            <Text style={styles.clockText}>
              {clock.hour}:{clock.minute} {clock.period}
            </Text>
          </View>
        ) : null}
      </View>
      <PressableScale
        onPress={() => router.push(`/(app)/bookings/${next.id}` as never)}
        wrapStyle={styles.startWrap}
        style={[styles.start, { backgroundColor: theme.accent }]}
      >
        <Text style={[styles.startText, { color: theme.ink }]}>View visit</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.paper,
  },
  content: {},
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
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rows: { gap: 12 },
  sectionTitle: { marginTop: 22, marginBottom: 12, fontSize: 18, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, paddingRight: 8 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { fontSize: 13, fontWeight: "600" },
  schedule: { borderRadius: 22, padding: 14 },
  scheduleTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  scheduleAvatar: { width: 42, height: 42, borderRadius: 21 },
  visitName: { fontSize: 16, fontWeight: "700" },
  visitMeta: { fontSize: 13 },
  clockText: { fontSize: 13, fontWeight: "400", color: "#000000" },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  startWrap: { alignSelf: "stretch", marginTop: 14 },
  start: {
    height: 48,
    borderRadius: 16,
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
