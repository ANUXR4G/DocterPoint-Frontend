import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  PageTitle,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { contentBottomPad } from "@/lib/dockLayout";
import { withDrTitle } from "@/lib/doctorName";
import { usePractice } from "@/lib/practiceContext";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import { fetchAuditLog } from "@/lib/procto";
import type { AuditAction, AuditEvent } from "@/lib/types";
import { colors, radii, shadows, space } from "@/lib/theme";

const ACTIONS: Array<[AuditAction | "", string]> = [
  ["", "All"],
  ["SLOT_CREATED", "Slots created"],
  ["SLOT_REMOVED", "Slots removed"],
  ["OVERRIDE_CREATED", "Leave & blocks"],
  ["OVERRIDE_REMOVED", "Blocks lifted"],
  ["WALK_IN_ADDED", "Walk-ins"],
  ["PATIENT_REGISTERED", "Registrations"],
];

const ACTION_TINT: Record<AuditAction, { bg: string; ink: string }> = {
  SLOT_CREATED: { bg: "#EDE9FE", ink: "#5B21B6" },
  SLOT_REMOVED: { bg: colors.sky100, ink: colors.inkSoft },
  OVERRIDE_CREATED: { bg: colors.amberLight, ink: "#B45309" },
  OVERRIDE_REMOVED: { bg: "#E0F2FE", ink: "#0369A1" },
  WALK_IN_ADDED: { bg: colors.roseLight, ink: colors.rose },
  PATIENT_REGISTERED: { bg: colors.emeraldLight, ink: colors.success },
};

function actionLabel(action: string) {
  return ACTIONS.find(([a]) => a === action)?.[1] ?? action;
}

/** Practice audit trail — in-app, same API as the web Audit log. */
export default function AuditScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [action, setAction] = useState<AuditAction | "">("");
  const [providerId, setProviderId] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [scope, setScope] = useState<"ANY" | "OWN" | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const doctors = useMemo(
    () =>
      (membership?.practice.members ?? [])
        .filter(
          (m) =>
            m.role === "DOCTOR" ||
            m.role === "PRACTICE_OWNER" ||
            m.role === "PRACTICE_ADMIN",
        )
        .map((m) => ({
          id: m.userId,
          name: withDrTitle(m.user.name) || m.user.email || "Doctor",
        })),
    [membership?.practice.members],
  );
  const doctorName = useMemo(
    () => new Map(doctors.map((d) => [d.id, d.name])),
    [doctors],
  );

  const load = useCallback(
    async (before?: string) => {
      if (!practiceId) return;
      if (before) setLoadingMore(true);
      else setLoading(true);
      const res = await fetchAuditLog(practiceId, {
        action: action || undefined,
        providerId: providerId || undefined,
        before,
        limit: 40,
      });
      if (before) setLoadingMore(false);
      else setLoading(false);
      if (res.status === "successful" && res.data) {
        const page = res.data;
        setScope(page.scope);
        setEvents((prev) =>
          before ? [...prev, ...page.events] : page.events,
        );
        setNext(page.nextBefore);
        setError("");
      } else {
        if (!before) setEvents([]);
        setNext(null);
        setError(res.message || "Could not load audit log.");
      }
    },
    [practiceId, action, providerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPad(insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PageTitle
          eyebrow="Practice"
          title="Audit log"
          subtitle={
            scope === "OWN"
              ? "Showing changes you made."
              : "Who changed slots, leave, walk-ins and registrations."
          }
        />

        <Text style={styles.section}>Action</Text>
        <View style={styles.chips}>
          {ACTIONS.map(([id, label]) => (
            <Chip
              key={id || "all"}
              label={label}
              active={action === id}
              onPress={() => setAction(id)}
            />
          ))}
        </View>

        {doctors.length > 1 ? (
          <>
            <Text style={styles.section}>Doctor</Text>
            <View style={styles.chips}>
              <Chip
                label="All doctors"
                active={!providerId}
                onPress={() => setProviderId("")}
              />
              {doctors.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  active={providerId === d.id}
                  onPress={() => setProviderId(d.id)}
                />
              ))}
            </View>
          </>
        ) : null}

        <ErrorText text={error} />

        {loading && !events.length ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : null}

        {!loading && !events.length && !error ? (
          <EmptyState text="No audit events for these filters." />
        ) : null}

        {events.map((e) => {
          const tint = ACTION_TINT[e.action] ?? {
            bg: colors.brandLight,
            ink: colors.brand,
          };
          return (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.badge, { backgroundColor: tint.bg }]}>
                  <Text style={[styles.badgeText, { color: tint.ink }]}>
                    {actionLabel(e.action)}
                  </Text>
                </View>
                <Text style={styles.when}>
                  {formatPracticeDateTime(e.createdAt)}
                </Text>
              </View>
              <Text style={styles.summary}>{e.summary}</Text>
              <Text style={styles.meta}>
                {[
                  e.actorName || "System",
                  e.providerId ? doctorName.get(e.providerId) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          );
        })}

        {next ? (
          <Pressable
            onPress={() => void load(next)}
            disabled={loadingMore}
            style={styles.moreBtn}
          >
            <Text style={styles.moreText}>
              {loadingMore ? "Loading…" : "Load older"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    gap: space.sm,
  },
  section: {
    marginTop: space.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.sm,
    ...shadows.soft,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.sm,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  when: { fontSize: 12, color: colors.inkFaint },
  summary: { fontSize: 15, fontWeight: "600", color: colors.ink },
  meta: { marginTop: 6, fontSize: 12, color: colors.inkSoft },
  moreBtn: {
    alignSelf: "center",
    marginTop: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.brandLight,
  },
  moreText: { fontWeight: "700", color: colors.brand },
});
