import { useMemo, useState } from "react";
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
import { CareBar, CareGlyph } from "@/components/mobile/careArt";
import { useCareTheme } from "@/lib/careTheme";
import { contentBottomPad } from "@/lib/dockLayout";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { resolveMediaUrl } from "@/lib/media";
import { patientRosterKey } from "@/lib/patientRoster";
import { formatPracticeTime } from "@/lib/practiceTime";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { ymd, type PracticePatient } from "@/lib/types";

const FILTERS = ["All", "Today's Visit", "High Priority", "Needs"] as const;

function needsAttention(status?: string | null) {
  return ["NO_SHOW", "CANCELED", "CANCELLED", "WAITING", "IN_PROGRESS"].includes(
    String(status || "").toUpperCase(),
  );
}

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return ymd(d) === ymd(new Date());
}

export default function PatientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const { patients: rows, error, refresh } = usePracticeLive();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((p) => {
      if (filter === "Today's Visit" && !isToday(p.lastVisitAt)) return false;
      if (
        filter === "High Priority" &&
        !["WAITING", "IN_PROGRESS"].includes(String(p.lastStatus || "").toUpperCase())
      ) {
        return false;
      }
      if (filter === "Needs" && !needsAttention(p.lastStatus)) return false;
      if (!needle) return true;
      const blob = [p.name, p.phone, p.bookedViaPhone, p.mrn, p.relationship]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, q, filter]);

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
            await refresh();
            setRefreshing(false);
          }}
          tintColor={theme.visitInk}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]}>Patients</Text>
        <Pressable
          accessibilityLabel="Notifications"
          onPress={() => router.push("/(app)/notifications" as never)}
          style={[styles.bell, { backgroundColor: theme.card }]}
        >
          <CareGlyph name="bell" size={18} color={theme.ink} />
        </Pressable>
      </View>

      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <CareGlyph name="search" size={16} color={theme.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search patients..."
          placeholderTextColor={theme.muted}
          style={[styles.searchInput, { color: theme.ink }]}
          autoCorrect={false}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {FILTERS.map((item) => {
          const on = item === filter;
          return (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[
                styles.chip,
                { backgroundColor: on ? theme.ink : theme.card },
              ]}
            >
              <Text style={{ color: on ? "#fff" : theme.ink, fontWeight: "600", fontSize: 13 }}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={{ color: theme.alertInk, marginBottom: 8 }}>{error}</Text> : null}

      {filtered.length === 0 ? (
        <Text style={{ color: theme.muted, marginTop: 12 }}>No patients match.</Text>
      ) : (
        filtered.map((p) => (
          <PatientRow
            key={patientRosterKey(p)}
            patient={p}
            onPress={() =>
              router.push(
                `/(app)/patients/${encodeURIComponent(patientRosterKey(p))}` as never,
              )
            }
          />
        ))
      )}
    </ScrollView>
  );
}

function PatientRow({
  patient,
  onPress,
}: {
  patient: PracticePatient;
  onPress: () => void;
}) {
  const { theme } = useCareTheme();
  const attention = needsAttention(patient.lastStatus);
  const recent = patient.recentBookings ?? patient.recent ?? [];
  const done = recent.filter(
    (b) => String(b.status).toUpperCase() === "COMPLETED",
  ).length;
  const ratio = recent.length ? Math.round((done / recent.length) * 100) : 0;
  const when = patient.lastVisitAt ? formatPracticeTime(patient.lastVisitAt) : "";
  const photo = resolveMediaUrl(patient.imgSrc);
  const age =
    typeof patient.age === "number"
      ? `${patient.age} years`
      : patient.mrn
        ? `MRN ${patient.mrn}`
        : formatPhoneDisplay(patient.phone);

  return (
    <View style={styles.row}>
      <View style={styles.timeCol}>
        <View style={[styles.timePill, { backgroundColor: attention ? theme.alert : theme.visit }]}>
          <Text style={[styles.time, { color: attention ? theme.alertInk : theme.visitInk }]}>
            {when || "—"}
          </Text>
        </View>
        <View style={[styles.rail, { backgroundColor: attention ? theme.attention : theme.stable }]} />
      </View>
      <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.cardTop}>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: attention ? theme.attention : theme.stable }]} />
            <Text style={[styles.state, { color: attention ? theme.alertInk : theme.taskInk }]}>
              {attention ? "needs attention" : "stable"}
            </Text>
          </View>
          <CareGlyph name="note" size={16} color={theme.muted} />
        </View>
        <View style={styles.person}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.visit, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: theme.visitInk, fontWeight: "700" }}>
                {(patient.name || "?").slice(0, 1)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.personName, { color: theme.ink }]} numberOfLines={1}>
              {patient.name || formatPhoneDisplay(patient.phone)}
            </Text>
            <Text style={[styles.personMeta, { color: theme.muted }]} numberOfLines={1}>
              {age}
              {patient.lastStatus ? ` · ${String(patient.lastStatus).replace(/_/g, " ").toLowerCase()}` : ""}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: theme.muted }]}>›</Text>
        </View>
        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: theme.muted }]}>Outcome progress</Text>
          <Text style={[styles.progressLabel, { color: theme.ink }]}>
            {recent.length ? `${ratio}%` : "—"}
          </Text>
        </View>
        <CareBar
          color={attention ? theme.attention : theme.stable}
          track={theme.line}
          ratio={recent.length ? ratio / 100 : 0}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.6 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    height: 46,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  filters: { marginTop: 12, marginBottom: 8, maxHeight: 44 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  timeCol: { width: 52, alignItems: "center" },
  timePill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  time: { fontSize: 10, fontWeight: "700" },
  rail: { width: 3, flex: 1, borderRadius: 2, marginTop: 6 },
  card: { flex: 1, borderRadius: 20, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { fontSize: 12, fontWeight: "600" },
  person: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  personName: { fontSize: 16, fontWeight: "700" },
  personMeta: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 22 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  progressLabel: { fontSize: 12 },
  track: { height: 4, borderRadius: 4, marginTop: 6, overflow: "hidden" },
  fill: { height: 4, borderRadius: 4 },
});
