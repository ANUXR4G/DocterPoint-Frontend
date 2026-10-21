import { useMemo, useState } from "react";
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
import { CareGlyph, CareQuickAction, CareStatCard } from "@/components/mobile/careArt";
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
  const today = ymd(new Date());
  const bookings = bookingsOnDate(today);

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

  const stats = [
    {
      label: "Today's Visits",
      value: pad(bookings.length),
      hint: `${inProgress} in progress`,
      background: theme.visit,
      ink: theme.visitInk,
      glyph: "calendar" as const,
      barColor: theme.visitInk,
      track: "#F6D7BE",
      variant: "dashes" as const,
      ratio: bookings.length ? inProgress / bookings.length : 0,
      href: "/(app)/appointments",
    },
    {
      label: "Today's Tasks",
      value: pad(pending),
      hint: `${pending} Pending`,
      background: theme.task,
      ink: theme.taskInk,
      glyph: "checklist" as const,
      barColor: theme.taskInk,
      track: "#D7F3E4",
      variant: "dots" as const,
      ratio: bookings.length ? pending / bookings.length : 0,
      href: "/(app)/queue",
    },
    {
      label: "Today's Patients",
      value: pad(seen || patients.length),
      hint: `${inProgress} in progress`,
      background: "#FFF4C8",
      ink: "#E0A31A",
      barColor: theme.peopleInk,
      track: "#E3EDF8",
      glyph: "personPlus" as const,
      variant: "solid" as const,
      ratio: patients.length ? Math.min(1, seen / patients.length) : 0,
      href: "/(app)/patients",
    },
    {
      label: "Today's Alerts",
      value: pad(alerts),
      hint: alerts ? "Need review" : "None waiting",
      background: theme.people,
      ink: theme.peopleInk,
      barColor: theme.accent,
      track: "#F7F0D4",
      glyph: "alert" as const,
      variant: "solid" as const,
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
          style={[styles.bell, { backgroundColor: theme.card, borderRadius: 14 }]}
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
            variant={s.variant}
            track={s.track}
            barColor={s.barColor}
            onPress={() => router.push(s.href as never)}
          />
        ))}
      </View>

      <Text style={[styles.section, { color: theme.ink }]}>Quick Actions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.actions}>
        <CareQuickAction label="Start Visit" glyph="stethoscope" onPress={() => router.push("/(app)/queue" as never)} />
        <CareQuickAction label="Note" glyph="note" onPress={() => router.push("/(app)/inbox" as never)} />
        <CareQuickAction label="Wellness" glyph="heart" onPress={() => router.push("/(app)/calendar" as never)} />
        <CareQuickAction label="Patients" glyph="people" onPress={() => router.push("/(app)/patients" as never)} />
      </ScrollView>

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
                {next.disease?.trim() || "No chief complaint"}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: theme.task }]}>
              <View style={[styles.badgeDot, { backgroundColor: theme.taskInk }]} />
              <Text style={[styles.badgeText, { color: theme.taskInk }]}>Scheduled</Text>
            </View>
          </View>
          <View style={styles.whenRow}>
            <CareGlyph name="clock" size={14} color={theme.muted} />
            <Text style={[styles.meta, { color: theme.muted }]}>{queueWhen(next)}</Text>
            {next.location?.address ? (
              <>
                <CareGlyph name="pin" size={14} color={theme.muted} />
                <Text style={[styles.meta, { color: theme.muted, flex: 1 }]} numberOfLines={1}>
                  {next.location.address}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.scheduleActions}>
            <Pressable
              onPress={() => router.push(`/(app)/visit/${next.id}` as never)}
              style={[styles.start, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.startText, { color: theme.ink }]}>Start Visit</Text>
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
    width: 42,
    height: 42,
    borderRadius: 14,
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
  actions: { flexDirection: "row", gap: 8, paddingRight: 8 },
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
  scheduleActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  start: {
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 16,
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
