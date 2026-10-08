import { useMemo, useState } from "react";
import {
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
import {
  DashMetric,
  PremiumAtmosphere,
} from "@/components/mobile/PremiumChrome";
import {
  isClinicAdminRole,
  isDeskRole,
  usePractice,
} from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { useBookingStatusActions } from "@/lib/useBookingStatusActions";
import { withDrTitle } from "@/lib/doctorName";
import {
  bookingPatientLabel,
  nextActions,
  whenLabel,
  ymd,
  type BookingRow,
} from "@/lib/types";
import { formatPracticeTime } from "@/lib/practiceTime";
import { colors, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import {
  countQueueStatusFilters,
  splitDayQueue,
} from "@/lib/bookingStatus";

const QUEUE_PREVIEW = 5;

function queueWhen(b: BookingRow) {
  if (b.mode === "TOKEN_BASED") return `Token #${b.tokenNumber ?? "?"}`;
  if (b.slotStart) return formatPracticeTime(b.slotStart);
  return whenLabel(b);
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membership, memberships } = usePractice();
  const {
    patients,
    liveConnected,
    error: liveError,
    refresh,
    bookingsOnDate,
  } = usePracticeLive();
  const { busyId, error: actionError, setStatus } = useBookingStatusActions();
  const [refreshing, setRefreshing] = useState(false);
  const today = ymd(new Date());
  const bookings = bookingsOnDate(today);
  const error = actionError || liveError || "";

  const practiceName = membership?.practice.name ?? "your clinic";
  const isClinicAdmin = isClinicAdminRole(membership?.role);
  const seesClinic = isDeskRole(membership?.role);
  const isIndependent = membership?.practice.type === "SOLO";
  const isStaffDoctor =
    !isIndependent && !seesClinic && membership?.role === "DOCTOR";
  const showDoctorOnRows =
    seesClinic &&
    (membership?.practice.members ?? []).filter(
      (m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER",
    ).length > 1;

  const counts = useMemo(
    () => countQueueStatusFilters(bookings.map((b) => b.status)),
    [bookings],
  );
  const openQueue = counts.waiting + counts.in_appointment;
  const { active, finished } = useMemo(
    () => splitDayQueue(bookings),
    [bookings],
  );
  const preview = active.slice(0, QUEUE_PREVIEW);

  const eyebrow = isStaffDoctor
    ? "Clinic staff · Doctor portal"
    : isIndependent
      ? "Independent practice · Doctor portal"
      : isClinicAdmin
        ? "Clinic portal"
        : "Doctor portal";
  const title = isStaffDoctor ? `Queue at ${practiceName}` : "Today at a glance";
  const subtitle = isStaffDoctor
    ? `You are signed in under ${practiceName}. Manage your own queue and patients; the clinic oversees the full roster.`
    : `${practiceName} · live queue and summary metrics.`;

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
              await refresh({ soft: true, force: true });
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle eyebrow={eyebrow} title={title} subtitle={subtitle} />

        <View style={styles.chips}>
          <Chip label={liveConnected ? "Live" : "Connecting…"} />
        </View>

        {memberships.length > 1 ? (
          <Text style={styles.switchHint}>
            Switch practice anytime from Account in the menu.
          </Text>
        ) : null}

        <View style={styles.quickLinks}>
          {(
            [
              { label: "Patient Support", href: "/(app)/inbox" },
              { label: "Appointments", href: "/(app)/appointments" },
              { label: "Patients", href: "/(app)/patients" },
              { label: "Calendar", href: "/(app)/calendar" },
              { label: "Analytics", href: "/(app)/analytics" },
              { label: "Notifications", href: "/(app)/notifications" },
              isIndependent || isClinicAdmin
                ? { label: "Subscription", href: "/(app)/subscriptions" }
                : { label: "My hours", href: "/(app)/schedule" },
              { label: "Settings", href: "/(app)/settings" },
            ] as Array<{ label: string; href: string }>
          ).map((item) => (
            <Chip
              key={item.href}
              label={item.label}
              onPress={() => router.push(item.href as never)}
            />
          ))}
        </View>

        <ErrorText text={error} />

        <View style={styles.metricsRow}>
          <DashMetric
            label="Patients"
            value={patients.length}
            hint={isStaffDoctor ? "Your patients" : "Clinic roster"}
            tone="blue"
            onPress={() => router.push("/(app)/patients")}
          />
          <DashMetric
            label="Today"
            value={bookings.length}
            hint="Bookings"
            tone="sky"
            onPress={() => router.push("/(app)/queue")}
          />
        </View>
        <View style={styles.metricsRow}>
          <DashMetric
            label="On queue"
            value={openQueue}
            hint="Waiting + in progress"
            tone="amber"
            onPress={() => router.push("/(app)/queue")}
          />
          <DashMetric
            label="Finished"
            value={counts.done}
            hint="Closed today"
            tone="emerald"
            onPress={() => router.push("/(app)/analytics")}
          />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>{"Today's queue"}</Text>
          <Chip
            label="Full queue →"
            onPress={() => router.push("/(app)/queue")}
          />
        </View>

        {!bookings.length && !liveError ? (
          <EmptyState text="No visits scheduled today. New bookings from web, WhatsApp, or the patient app appear here live." />
        ) : null}

        {bookings.length > 0 && !active.length ? (
          <Text style={styles.queueNote}>
            Everyone is seen for today — {finished.length} finished.
          </Text>
        ) : null}

        {preview.map((b) => {
          const name = bookingPatientLabel(b);
          const busy = busyId === b.id;
          return (
            <SurfaceCard
              key={b.id}
              onPress={() => router.push(`/(app)/visit/${b.id}`)}
            >
              <View style={styles.row}>
                <View style={styles.whenPill}>
                  <Text style={styles.whenText}>{queueWhen(b)}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <StatusBadge status={b.status} />
              </View>
              {showDoctorOnRows && b.provider?.name ? (
                <Text style={styles.meta}>{withDrTitle(b.provider.name)}</Text>
              ) : null}
              {b.disease ? <Text style={styles.meta}>{b.disease}</Text> : null}
              <View style={styles.actions}>
                {nextActions(b.status).map((s) => (
                  <Chip
                    key={s.status}
                    label={busy ? "Saving…" : s.label}
                    onPress={busy ? undefined : () => setStatus(b.id, s.status)}
                    disabled={busy}
                  />
                ))}
                <Chip
                  label="Open visit"
                  onPress={() => router.push(`/(app)/visit/${b.id}`)}
                />
              </View>
            </SurfaceCard>
          );
        })}

        {active.length > QUEUE_PREVIEW ? (
          <Chip
            label={`+${active.length - QUEUE_PREVIEW} more in the full queue`}
            onPress={() => router.push("/(app)/queue")}
          />
        ) : null}

        {active.length > 0 && finished.length > 0 ? (
          <Text style={styles.queueNote}>
            {finished.length} finished today.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  switchHint: {
    fontSize: 13,
    color: colors.inkFaint,
  },
  metricsRow: {
    flexDirection: "row",
    gap: space.md,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.sm,
  },
  section: {
    marginTop: space.sm,
    marginBottom: space.xs,
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.xs,
  },
  quickLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingVertical: space.xs,
  },
  queueNote: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  whenPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.brandLight,
  },
  whenText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink, flex: 1 },
  meta: {
    marginTop: space.xs,
    fontSize: 13,
    color: colors.inkSoft,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
});
