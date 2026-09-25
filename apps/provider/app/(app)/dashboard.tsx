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
} from "@/components/ui";
import {
  DashLinkCard,
  DashMetric,
  PremiumAtmosphere,
} from "@/components/mobile/PremiumChrome";
import {
  usePractice,
  usePracticeLabel,
} from "@/lib/practiceContext";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { ymd } from "@/lib/types";
import { colors, dashOrder, space, type DashTone } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import {
  countQueueStatusFilters,
  matchesQueueStatusFilter,
} from "@/lib/bookingStatus";

type QuickLink = {
  title: string;
  body: string;
  href: string;
  tone: DashTone;
};

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membership, memberships } = usePractice();
  const label = usePracticeLabel(membership);
  const {
    patients,
    liveConnected,
    error: liveError,
    refresh,
    bookingsOnDate,
  } = usePracticeLive();
  const [today] = useState(() => ymd(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const bookings = bookingsOnDate(today);
  const error = liveError || "";

  const isClinicAdmin =
    membership?.role === "PRACTICE_OWNER" ||
    membership?.role === "PRACTICE_ADMIN";

  const openQueue = useMemo(() => {
    const statuses = bookings.map((b) => b.status);
    const c = countQueueStatusFilters(statuses);
    return c.waiting + c.in_appointment;
  }, [bookings]);

  const finishedToday = useMemo(() => {
    return bookings.filter((b) =>
      matchesQueueStatusFilter(b.status, "done"),
    ).length;
  }, [bookings]);

  const quickLinks: QuickLink[] = useMemo(() => {
    const base: QuickLink[] = [
      {
        title: "Today's queue",
        body: "Start, complete, or mark no-show",
        href: "/(app)/queue",
        tone: "amber",
      },
      {
        title: "Calendar",
        body: "Month view of upcoming visits",
        href: "/(app)/calendar",
        tone: "sky",
      },
      {
        title: "Patients",
        body: "Clinic roster and visit history",
        href: "/(app)/patients",
        tone: "blue",
      },
      {
        title: "Analytics",
        body: "Patients and bookings over time",
        href: "/(app)/analytics",
        tone: "teal",
      },
      {
        title: "Appointments list",
        body: "Search and filter all visits",
        href: "/(app)/appointments",
        tone: "emerald",
      },
      {
        title: "Plans & billing",
        body: "Trial, subscription, WhatsApp line",
        href: "/(app)/subscriptions",
        tone: "coral",
      },
    ];
    if (isClinicAdmin) {
      base.splice(2, 0, {
        title: "Hours & blocks",
        body: "Override schedules and leave",
        href: "/(app)/schedule",
        tone: dashOrder[1]!,
      });
    }
    return base;
  }, [isClinicAdmin]);

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
        <PageTitle
          eyebrow={isClinicAdmin ? "Clinic portal" : "Doctor portal"}
          title="Today at a glance"
          subtitle={`${membership?.practice.name ?? "Practice"} · ${label}`}
        />

        <View style={styles.chips}>
          <Chip label={liveConnected ? "Live" : "Connecting…"} />
        </View>

        {memberships.length > 1 ? (
          <Text style={styles.switchHint}>
            Switch practice anytime from More.
          </Text>
        ) : null}

        <ErrorText text={error} />

        <View style={styles.metricsRow}>
          <DashMetric
            label="Patients"
            value={patients.length}
            hint="Clinic roster"
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
            value={finishedToday}
            hint="Closed today"
            tone="emerald"
            onPress={() => router.push("/(app)/analytics")}
          />
        </View>

        <Text style={styles.section}>Quick actions</Text>
        <View style={styles.chips}>
          <Chip label="Open queue" onPress={() => router.push("/(app)/queue")} />
          <Chip
            label="Calendar"
            onPress={() => router.push("/(app)/calendar")}
          />
          <Chip
            label="Analytics"
            onPress={() => router.push("/(app)/analytics")}
          />
          <Chip
            label="WhatsApp inbox"
            onPress={() => router.push("/(app)/inbox")}
          />
        </View>

        <Text style={styles.section}>Dashboard</Text>
        {quickLinks.map((link) => (
          <DashLinkCard
            key={link.href}
            title={link.title}
            body={link.body}
            tone={link.tone}
            onPress={() => router.push(link.href as never)}
          />
        ))}

        {!bookings.length && !error ? (
          <EmptyState text="No visits scheduled today. New bookings from web, WhatsApp, or the patient app appear on the queue." />
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
});
