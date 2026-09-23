import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
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
import { usePractice } from "@/lib/practiceContext";
import {
  dismissPracticeNotification,
  fetchPracticeNotifications,
  type PracticeNotificationRow,
} from "@/lib/procto";
import { colors, radii, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";

const STATUS_FILTERS = ["ALL", "SENT", "PENDING", "FAILED", "SKIPPED"] as const;

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [status, setStatus] =
    useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [items, setItems] = useState<PracticeNotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState("");
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      const res = await fetchPracticeNotifications(practiceId, {
        status: status === "ALL" ? undefined : status,
        take: 80,
      });
      if (res.status === "successful" && res.data) {
        const data = res.data;
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(data.total ?? 0);
        setPendingCount(data.pendingCount ?? 0);
        setFailedCount(data.failedCount ?? 0);
        setSentCount(data.sentCount ?? 0);
        if (!opts?.silent) setError("");
      } else if (!opts?.silent) {
        setError(res.message || "Could not load notifications");
        setItems([]);
      }
    },
    [practiceId, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useProctoLiveSocket(
    practiceId,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        (event.event === "booking_created" ||
          event.event === "booking_updated")
      ) {
        void load({ silent: true });
      }
    },
    () => void load({ silent: true }),
  );

  async function dismiss(id: string) {
    if (!practiceId || dismissingId) return;
    setDismissingId(id);
    const prev = items;
    setItems((cur) => cur.filter((n) => n.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    const res = await dismissPracticeNotification(practiceId, id);
    setDismissingId(null);
    if (res.status !== "successful") {
      setItems(prev);
      setTotal(prev.length);
      setError(res.message || "Could not clear notification");
      return;
    }
    setError("");
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentBottomPad(insets.bottom, { fab: true }) },
      ]}
    >
      <PageTitle
        eyebrow={membership?.practice.name}
        title="Notifications"
        subtitle="Open booking alerts. Tap a row to clear it."
      />

      <View style={styles.filters}>
        {STATUS_FILTERS.map((s) => (
          <Chip
            key={s}
            label={s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            active={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>

      <View style={styles.counts}>
        <Text style={styles.count}>{total} open</Text>
        <Text style={styles.count}>{sentCount} sent</Text>
        <Text style={styles.count}>{pendingCount} pending</Text>
        <Text style={styles.count}>{failedCount} failed</Text>
      </View>

      <ErrorText text={error} />

      {items.length === 0 ? (
        <EmptyState text="No open notifications." />
      ) : (
        items.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => void dismiss(n.id)}
            disabled={dismissingId === n.id}
            style={[styles.card, dismissingId === n.id && styles.cardBusy]}
          >
            <Text style={styles.title}>{n.title}</Text>
            <Text style={styles.summary}>{n.summary}</Text>
            <Text style={styles.meta}>
              {n.status}
              {" · "}
              {n.recipientRole === "clinic" ? "Clinic" : "Patient"}
              {" · "}
              {n.channel}
              {n.to ? ` · ${n.to}` : ""}
            </Text>
            <Text style={styles.when}>
              {new Date(n.createdAt).toLocaleString()}
              {" · Tap to clear"}
            </Text>
            {n.booking?.id ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  router.push(`/(app)/visit/${n.booking!.id}`);
                }}
                style={styles.linkWrap}
              >
                <Text style={styles.link}>Open visit →</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  counts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.lg,
  },
  count: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
    backgroundColor: colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    overflow: "hidden",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radii.xl,
  },
  cardBusy: { opacity: 0.55 },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  summary: {
    marginTop: space.xs,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  meta: { marginTop: space.sm, fontSize: 12, color: colors.inkSoft },
  when: { marginTop: 4, fontSize: 11, color: colors.inkFaint },
  linkWrap: { marginTop: space.sm },
  link: { fontSize: 13, fontWeight: "700", color: colors.brand },
});
