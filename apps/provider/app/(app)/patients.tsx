import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EmptyState,
  ErrorText,
  PageTitle,
  StatusBadge,
  SurfaceCard,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { resolveMediaUrl } from "@/lib/media";
import { usePractice } from "@/lib/practiceContext";
import { contentBottomPad } from "@/lib/dockLayout";
import { fetchPracticePatients } from "@/lib/procto";
import type { PracticePatient } from "@/lib/types";
import { colors, radii, shadows, space } from "@/lib/theme";

export default function PatientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [rows, setRows] = useState<PracticePatient[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!practiceId) return;
    const res = await fetchPracticePatients(practiceId);
    if (res.status === "successful") {
      setRows((res.data as PracticePatient[]) ?? []);
      setError("");
    } else {
      setError(res.message || "Could not load patients");
    }
  }, [practiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const phone = (p.phone || "").toLowerCase();
      const via = (p.bookedViaPhone || "").toLowerCase();
      const mrn = (p.mrn || "").toLowerCase();
      const rel = (p.relationship || "").toLowerCase();
      return (
        name.includes(needle) ||
        phone.includes(needle) ||
        via.includes(needle) ||
        mrn.includes(needle) ||
        rel.includes(needle)
      );
    });
  }, [rows, q]);

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
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
        keyboardShouldPersistTaps="handled"
      >
        <PageTitle
          eyebrow={membership?.practice.name}
          title="Patients"
          subtitle={`${rows.length} in your practice roster`}
        />

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, phone, or MRN"
          placeholderTextColor={colors.inkFaint}
          style={styles.search}
          autoCorrect={false}
        />

        <ErrorText text={error} />

        {filtered.length === 0 ? (
          <EmptyState text="No patients match this search." />
        ) : (
          filtered.map((p) => {
            const key = `${p.phone}|${(p.name || "").trim().toLowerCase()}`;
            const open = expanded === key;
            const visits = p.recentBookings ?? p.recent ?? [];
            return (
              <SurfaceCard key={key}>
                <Pressable
                  onPress={() => setExpanded(open ? null : key)}
                  style={styles.row}
                >
                  {resolveMediaUrl(p.imgSrc) ? (
                    <Image
                      source={{ uri: resolveMediaUrl(p.imgSrc)! }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {(p.name || p.phone || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {p.name || formatPhoneDisplay(p.phone)}
                    </Text>
                    {p.mrn?.trim() ? (
                      <Text style={styles.meta}>MRN {p.mrn.trim()}</Text>
                    ) : null}
                    {p.relationship?.trim() ? (
                      <Text style={styles.meta}>{p.relationship.trim()}</Text>
                    ) : null}
                    <Text style={styles.meta}>
                      Booked via {formatPhoneDisplay(p.bookedViaPhone || p.phone)}{" "}
                      · {p.bookingCount} visits
                    </Text>
                    {p.lastStatus ? (
                      <View style={{ marginTop: 8 }}>
                        <StatusBadge status={p.lastStatus} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                {open ? (
                  <View style={styles.recent}>
                    {visits.length === 0 ? (
                      <Text style={styles.visitLabel}>No recent visits.</Text>
                    ) : (
                      visits.slice(0, 8).map((b) => (
                        <Pressable
                          key={b.id}
                          onPress={() => router.push(`/(app)/visit/${b.id}`)}
                          style={styles.visitRow}
                        >
                          <Text style={styles.visitLabel}>
                            {(b.sessionDate || b.slotStart || "")
                              .toString()
                              .slice(0, 10)}{" "}
                            · {String(b.status || "").replace(/_/g, " ")}
                          </Text>
                          <Text style={styles.openLink}>Open</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.ink,
    borderRadius: radii.lg,
    marginBottom: space.lg,
    ...shadows.soft,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.line,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandLight,
  },
  avatarInitial: { fontSize: 16, fontWeight: "700", color: colors.brand },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  recent: {
    marginTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: space.md,
    gap: 8,
  },
  visitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.sky50,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  visitLabel: { fontSize: 13, color: colors.inkSoft, flex: 1 },
  openLink: { fontSize: 13, fontWeight: "600", color: colors.brand },
});
