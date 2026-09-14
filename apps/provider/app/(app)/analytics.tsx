import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  Loading,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { usePractice } from "@/lib/practiceContext";
import { fetchPracticeAnalytics } from "@/lib/procto";
import { colors, radii, space } from "@/lib/theme";
import { dockClearance } from "@/lib/dockLayout";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";

type Period = "week" | "month" | "day";

type BucketCell = {
  patients?: {
    male?: number
    female?: number
    others?: number
    unknown?: number
  }
  appointments?: {
    male?: number
    female?: number
    others?: number
    unknown?: number
  }
};

function sumGender(g?: {
  male?: number
  female?: number
  others?: number
  unknown?: number
}) {
  return (
    (g?.male ?? 0) +
    (g?.female ?? 0) +
    (g?.others ?? 0) +
    (g?.unknown ?? 0)
  )
}

type DoctorRow = {
  providerId: string;
  name: string;
  bookings: number;
  waiting: number;
  inProgress: number;
  completed: number;
  canceled: number;
  noShow: number;
};

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, providerId, membership } = usePractice();
  const [period, setPeriod] = useState<Period>("week");
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!practiceId) return;
    if (!opts?.silent) {
      setLoading(true);
      setError("");
    }
    const res = await fetchPracticeAnalytics(practiceId, {
      type: period,
      providerId: providerId ?? undefined,
    });
    if (!opts?.silent) setLoading(false);
    if (res.status !== "successful") {
      if (!opts?.silent) {
        setRaw(null);
      setError(
        res.message ||
          "Analytics needs an active subscription. Open Plans to subscribe.",
      );
      }
      return;
    }
    setRaw((res.data as Record<string, unknown>) ?? null);
    if (!opts?.silent) setError("");
  }, [practiceId, providerId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  useProctoLiveSocket(
    practiceId,
    () => {
      void load({ silent: true });
    },
    () => {
      void load({ silent: true });
    },
  );

  const buckets = useMemo(() => {
    if (!raw || typeof raw !== "object") return [];
    const series =
      (raw.series as Record<string, BucketCell> | undefined) ??
      (raw as Record<string, BucketCell>);
    const entries = Object.entries(series).filter(
      ([k, v]) =>
        k !== "byDoctor" &&
        k !== "series" &&
        v &&
        typeof v === "object" &&
        ("appointments" in (v as object) || "patients" in (v as object)),
    ) as Array<[string, BucketCell]>;
    return entries.map(([label, cell]) => ({
      label,
      appointments: sumGender(cell.appointments),
      patients: sumGender(cell.patients),
    }));
  }, [raw]);

  const totals = useMemo(() => {
    return buckets.reduce(
      (acc, b) => ({
        appointments: acc.appointments + b.appointments,
        patients: acc.patients + b.patients,
      }),
      { appointments: 0, patients: 0 },
    );
  }, [buckets]);

  const doctors = useMemo(() => {
    const list = raw?.byDoctor;
    return Array.isArray(list) ? (list as DoctorRow[]) : [];
  }, [raw]);

  const maxAppt = Math.max(1, ...buckets.map((b) => b.appointments));

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: dockClearance + 24 },
        ]}
      >
      <PageTitle
        eyebrow={membership?.practice.name}
        title="Analytics"
        subtitle="Same practice analytics as the doctor web dashboard."
      />

      <View style={styles.chips}>
        {(
          [
            ["day", "Today"],
            ["week", "Week"],
            ["month", "Month"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            label={label}
            active={period === id}
            onPress={() => setPeriod(id)}
          />
        ))}
      </View>

      <ErrorText text={error} />
      {error ? (
        <PrimaryButton label="Retry" onPress={() => void load()} />
      ) : null}

      {loading ? <Loading /> : null}

      {!loading && !error ? (
        <>
          <View style={styles.metrics}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{totals.appointments}</Text>
              <Text style={styles.metricLabel}>Appointments</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{totals.patients}</Text>
              <Text style={styles.metricLabel}>Patients</Text>
            </View>
          </View>

          {buckets.length === 0 ? (
            <EmptyState text="No data for this period." />
          ) : (
            buckets.map((b) => (
              <View key={b.label} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>
                  {b.label}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(b.appointments / maxAppt) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{b.appointments}</Text>
              </View>
            ))
          )}

          {doctors.length > 0 ? (
            <>
              <Text style={styles.section}>By doctor</Text>
              {doctors.map((d) => (
                <View key={d.providerId} style={styles.card}>
                  <Text style={styles.docName}>{d.name}</Text>
                  <Text style={styles.meta}>
                    {d.bookings} bookings · {d.completed} done · {d.waiting}{" "}
                    waiting · {d.inProgress} in progress
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.md },
  metrics: { flexDirection: "row", gap: 12, marginBottom: space.lg },
  metricCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.navy,
    letterSpacing: -0.5,
  },
  metricLabel: { marginTop: 4, fontSize: 12, color: colors.inkSoft },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  barLabel: { width: 88, fontSize: 12, color: colors.inkSoft },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.brandMist,
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: colors.brand, borderRadius: 999 },
  barValue: { width: 28, textAlign: "right", fontSize: 12, color: colors.ink },
  section: {
    marginTop: space.lg,
    marginBottom: space.sm,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: 8,
  },
  docName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  meta: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
});
