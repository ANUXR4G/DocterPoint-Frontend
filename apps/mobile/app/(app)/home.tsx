import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { ClinicCard } from "@/components/mobile/ClinicCards";
import { PatientDashboard, SectionHead } from "@/components/mobile/PatientDashboard";
import { SpecialtyChips } from "@/components/mobile/SpecialtyRow";
import { ErrorText, Loading, PrimaryButton, Screen } from "@/components/ui";
import { AnimatedView, PressableScale } from "@/lib/motion";
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
import { contentBottomPad } from "@/lib/dockLayout";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { PRACTICE_TIMEZONE } from "@/lib/practiceTime";
import { colors, radii, shadows, space } from "@/lib/theme";
import type { PatientProfile, PracticeListItem } from "@/lib/types";

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

  if (loading && !hasData && !refreshing) return <Loading />;

  return (
    <Screen style={styles.screen}>
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
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.hello} numberOfLines={1}>
              {firstName ? `Hello, ${firstName}` : "Hello"}
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push("/(app)/profile")}
            accessibilityRole="button"
            accessibilityLabel={`Profile${liveConnected ? ", live updates on" : ""}`}
          >
            <ClinicAvatar
              name={name || "You"}
              uri={photo}
              size={48}
              radius={24}
              backgroundColor={colors.brandLight}
              style={styles.avatar}
            />
            {liveConnected ? <View style={styles.liveDot} /> : null}
          </PressableScale>
        </AnimatedView>

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

        <PatientDashboard bookings={bookings} loading={bookingsLoading || !bookingsReady} />

        {practices.length ? (
          <AnimatedView from="up" delay={220} style={styles.section}>
            <SectionHead
              title="Find a clinic"
              action="See all"
              onAction={() => router.push("/(app)/doctors")}
            />
            <SpecialtyChips
              onSelect={(name) =>
                router.push(
                  name
                    ? { pathname: "/(app)/doctors", params: { specialty: name } }
                    : "/(app)/doctors",
                )
              }
            />
            <View style={styles.clinics}>
              {practices.slice(0, 2).map((p) => (
                <ClinicCard key={p.id} item={p} />
              ))}
            </View>
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
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.8,
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
  section: {
    marginTop: space.xxl,
  },
  clinics: {
    marginTop: space.md,
    gap: space.lg,
  },
});
