import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { CareGlyph, CareQuickAction, CareStatCard } from "@/components/mobile/careArt";
import { CareWelcome } from "@/components/mobile/CareWelcome";
import { useCareTheme } from "@/lib/careTheme";
import { contentBottomPad } from "@/lib/dockLayout";
import { resolveMediaUrl } from "@/lib/media";
import { formatPracticeTime } from "@/lib/practiceTime";
import { usePractice } from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import {
  bookingPatientLabel,
  whenLabel,
  ymd,
  type BookingRow,
} from "@/lib/types";

const WELCOME_KEY = "gg.careWelcome";

function queueWhen(b: BookingRow) {
  if (b.mode === "TOKEN_BASED") return `Token #${b.tokenNumber ?? "?"}`;
  if (b.slotStart) return formatPracticeTime(b.slotStart);
  return whenLabel(b);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const { membership } = usePractice();
  const { patients, error: liveError, refresh, bookingsOnDate } = usePracticeLive();
  const [refreshing, setRefreshing] = useState(false);
  const [welcome, setWelcome] = useState<boolean | null>(null);
  const today = ymd(new Date());
  const bookings = bookingsOnDate(today);

  useEffect(() => {
    void SecureStore.getItemAsync(WELCOME_KEY).then((v) => setWelcome(v !== "1"));
  }, []);

  async function dismissWelcome(href?: string) {
    await SecureStore.setItemAsync(WELCOME_KEY, "1");
    setWelcome(false);
    if (href) router.push(href as never);
  }

  const me = membership?.practice.members.find(
    (m) => m.userId === membership.userId,
  )?.user;
  const name = me?.name?.trim() || "Doctor";
  const photo = resolveMediaUrl(me?.imgSrc);

  const inProgress = bookings.filter(
    (b) => String(b.status).toUpperCase() === "IN_PROGRESS",
  ).length;
  const pending = bookings.filter((b) =>
    ["WAITING", "ACCEPTED", "SCHEDULED", "CONFIRMED", "REQUESTED"].includes(
      String(b.status).toUpperCase(),
    ),
  ).length;
  const alerts = bookings.filter((b) =>
    ["NO_SHOW", "CANCELED", "CANCELLED"].includes(String(b.status).toUpperCase()),
  ).length;
  const seen = useMemo(() => {
    const ids = new Set(
      bookings.map((b) => b.patientId || b.patientPhone).filter(Boolean),
    );
    return ids.size;
  }, [bookings]);
  const next = bookings.find(
    (b) => !["COMPLETED", "CANCELED", "CANCELLED", "NO_SHOW"].includes(
      String(b.status).toUpperCase(),
    ),
  );

  if (welcome) {
    return (
      <CareWelcome
        name={name.split(" ")[0]}
        onContinue={() => void dismissWelcome()}
        onFocus={(title) => {
          const href =
            title === "Daily Tasks"
              ? "/(app)/queue"
              : title === "Patient Care"
                ? "/(app)/patients"
                : "/(app)/appointments";
          void dismissWelcome(href);
        }}
      />
    );
  }

  const stats = [
    {
      label: "Today's Visits",
      value: pad(bookings.length),
      hint: `${inProgress} in progress`,
      background: theme.visit,
      ink: theme.visitInk,
      glyph: "calendar" as const,
      ratio: bookings.length ? inProgress / bookings.length : 0,
      href: "/(app)/appointments",
    },
    {
      label: "Today's Tasks",
      value: pad(pending),
      hint: `${pending} pending`,
      background: theme.task,
      ink: theme.taskInk,
      glyph: "checklist" as const,
      ratio: bookings.length ? pending / bookings.length : 0,
      href: "/(app)/queue",
    },
    {
      label: "Today's Patients",
      value: pad(seen || patients.length),
      hint: `${seen} on today's list`,
      background: theme.people,
      ink: theme.peopleInk,
      glyph: "people" as const,
      ratio: patients.length ? Math.min(1, seen / patients.length) : 0,
      href: "/(app)/patients",
    },
    {
      label: "Today's Alerts",
      value: pad(alerts),
      hint: alerts ? "Need review" : "None waiting",
      background: theme.alert,
      ink: theme.alertInk,
      glyph: "bell" as const,
      ratio: bookings.length ? alerts / bookings.length : 0,
      href: "/(app)/notifications",
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.paper }}
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: contentBottomPad(insets.bottom),
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh({ soft: true, force: true });
            setRefreshing(false);
          }}
          tintColor={theme.visitInk}
        />
      }
    >
      <View style={styles.header}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.visit }]}>
            <Text style={{ color: theme.visitInk, fontWeight: "700" }}>
              {name.slice(0, 1)}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.greet, { color: theme.muted }]}>
            {new Date().getHours() < 12
              ? "Good morning"
              : new Date().getHours() < 17
                ? "Good afternoon"
                : "Good evening"}
          </Text>
          <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Notifications"
          onPress={() => router.push("/(app)/notifications" as never)}
          style={[styles.bell, { backgroundColor: theme.card }]}
        >
          <CareGlyph name="bell" size={18} color={theme.ink} />
        </Pressable>
      </View>

      {liveError ? (
        <Text style={[styles.error, { color: theme.alertInk }]}>{liveError}</Text>
      ) : null}

      <View style={styles.grid}>
        {stats.map((s) => (
          <CareStatCard
            key={s.label}
            label={s.label}
            value={s.value}
            hint={s.hint}
            background={s.background}
            ink={s.ink}
            glyph={s.glyph}
            ratio={s.ratio}
            onPress={() => router.push(s.href as never)}
          />
        ))}
      </View>

      <Text style={[styles.section, { color: theme.ink }]}>Quick Actions</Text>
      <View style={styles.actions}>
        <CareQuickAction label="Start Visit" glyph="bolt" onPress={() => router.push("/(app)/queue" as never)} />
        <CareQuickAction label="Note" glyph="note" onPress={() => router.push("/(app)/inbox" as never)} />
        <CareQuickAction label="Wellness" glyph="heart" onPress={() => router.push("/(app)/calendar" as never)} />
        <CareQuickAction label="Patients" glyph="people" onPress={() => router.push("/(app)/patients" as never)} />
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.section, { color: theme.ink }]}>Today's Schedule</Text>
        <Pressable onPress={() => router.push("/(app)/appointments")}>
          <Text style={[styles.link, { color: theme.muted }]}>View all</Text>
        </Pressable>
      </View>

      {next ? (
        <View style={[styles.schedule, { backgroundColor: theme.card }]}>
          <View style={styles.scheduleTop}>
            {resolveMediaUrl(next.patient?.imgSrc) ? (
              <Image source={{ uri: resolveMediaUrl(next.patient?.imgSrc)! }} style={styles.scheduleAvatar} />
            ) : (
              <View style={[styles.scheduleAvatar, { backgroundColor: theme.visit, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: theme.visitInk, fontWeight: "700" }}>
                  {bookingPatientLabel(next).slice(0, 1)}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.patient, { color: theme.ink }]} numberOfLines={1}>
                {bookingPatientLabel(next)}
              </Text>
              <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
                {next.disease?.trim() || next.patient?.mrn || "Clinic visit"}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: theme.task }]}>
              <Text style={[styles.badgeText, { color: theme.taskInk }]}>Scheduled</Text>
            </View>
          </View>
          <View style={styles.whenRow}>
            <CareGlyph name="calendar" size={14} color={theme.muted} />
            <Text style={[styles.meta, { color: theme.muted, flex: 1 }]} numberOfLines={1}>
              {queueWhen(next)}
              {next.location?.address ? `   ${next.location.address}` : ""}
            </Text>
          </View>
          <View style={styles.scheduleActions}>
            <Pressable
              accessibilityLabel="Open visit"
              onPress={() => router.push(`/(app)/visit/${next.id}` as never)}
              style={[styles.round, { backgroundColor: theme.paper }]}
            >
              <CareGlyph name="video" size={18} color={theme.ink} />
            </Pressable>
            <Pressable
              onPress={() => router.push(`/(app)/visit/${next.id}` as never)}
              style={[styles.start, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.startText, { color: theme.ink }]}>Start Visit</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open visit"
              onPress={() => router.push(`/(app)/visit/${next.id}` as never)}
              style={[styles.round, { backgroundColor: theme.ink }]}
            >
              <CareGlyph name="expand" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.schedule, { backgroundColor: theme.card }]}>
          <Text style={[styles.patient, { color: theme.ink }]}>No visit waiting</Text>
          <Text style={[styles.meta, { color: theme.muted, marginTop: 6 }]}>
            New bookings from the web, WhatsApp, or the patient app show up here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  greet: { fontSize: 13 },
  name: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { marginBottom: 8, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { width: "48%", borderRadius: 22, padding: 14, flexGrow: 1 },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { marginTop: 12, fontSize: 13, fontWeight: "600" },
  statValue: { marginTop: 4, fontSize: 32, fontWeight: "700", letterSpacing: -1 },
  bar: { marginTop: 8, height: 4, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 4 },
  statHint: { marginTop: 6, fontSize: 12 },
  section: { marginTop: 22, marginBottom: 12, fontSize: 18, fontWeight: "700" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  link: { fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  action: { alignItems: "center", width: 72 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { marginTop: 6, fontSize: 11, fontWeight: "600", textAlign: "center" },
  schedule: { borderRadius: 22, padding: 14 },
  scheduleTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  scheduleAvatar: { width: 42, height: 42, borderRadius: 21 },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  patient: { fontSize: 16, fontWeight: "700" },
  meta: { fontSize: 13 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  scheduleActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  start: {
    height: 40,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  startText: { fontSize: 15, fontWeight: "700" },
});
