import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Panel, SectionTitle } from "@/components/ui";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import { colors, space } from "@/lib/theme";
import type { BookingDetail } from "@/lib/types";

type Pain = {
  scale?: string;
  score?: string;
  location?: string;
  type?: string;
};
type Allergy = { name?: string; severity?: string; active?: string };
type Assessment = {
  savedAt?: string | null;
  noKnownAllergies?: boolean;
  vitals?: {
    recordedAt?: string | null;
    values?: Record<string, number | null>;
  };
  pain?: Pain[];
  allergies?: Allergy[];
};

function asAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Assessment;
}

/** Read-only clinic log the patient sees — same Rx the doctor sends. */
export function VisitRx({ booking }: { booking: BookingDetail }) {
  const [tab, setTab] = useState<"visit" | "clinical" | "prescription">(
    "visit",
  );
  const assessment = asAssessment(booking.clinicalAssessment);
  const values = assessment?.vitals?.values ?? {};
  const medicines = (booking.medicines ?? []).filter((m) => m?.name?.trim());
  const remarks = booking.doctorRemarks?.trim() || "";
  const recorded =
    assessment?.savedAt || assessment?.vitals?.recordedAt
      ? formatPracticeDateTime(
          assessment?.savedAt || assessment?.vitals?.recordedAt || "",
        )
      : "";
  const vitals = [
    ["Ht", values.ht],
    ["Wt", values.wt],
    ["BMI", values.bmi],
    ["Temp", values.temp],
    [
      "BP",
      values.bp_sys != null || values.bp_dia != null
        ? `${values.bp_sys ?? "—"}/${values.bp_dia ?? "—"}`
        : null,
    ],
    ["PR", values.pr],
    ["SpO2", values.spo2],
    ["RBS", values.rbs],
  ] as Array<[string, string | number | null | undefined]>;
  const hasVitals = vitals.some(([, v]) => v != null && v !== "");
  const allergies = (assessment?.allergies ?? []).filter((r) => r.name?.trim());
  const allergyText = assessment?.noKnownAllergies
    ? "No known allergy"
    : allergies.length
      ? allergies
          .map((r) =>
            [r.name, r.severity, r.active === "Yes" ? "Active" : null]
              .filter(Boolean)
              .join(" — "),
          )
          .join("; ")
      : "";
  const pain = (assessment?.pain ?? []).filter(
    (r) => r.scale?.trim() || r.score?.trim() || r.location?.trim(),
  );
  const painText = pain.length
    ? pain
        .map((r) =>
          [r.scale, r.score, r.location ? `Location: ${r.location}` : null, r.type]
            .filter(Boolean)
            .join(" · "),
        )
        .join("; ")
    : "";

  return (
    <Panel style={styles.panel}>
      <SectionTitle>Prescription (Rx)</SectionTitle>
      <View style={styles.tabs}>
        {(
          [
            ["visit", "Visit"],
            ["clinical", "Clinical"],
            ["prescription", "Prescription"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabOn]}
          >
            <Text style={[styles.tabLabel, tab === id && styles.tabLabelOn]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "visit" ? (
        <>
          {recorded ? <Text style={styles.muted}>Saved {recorded}</Text> : null}
          <Text style={styles.block}>
            <Text style={styles.label}>Allergies. </Text>
            {allergyText || "No known allergy"}
          </Text>
          <Text style={styles.block}>
            <Text style={styles.label}>Remarks. </Text>
            {remarks || "No remarks from the doctor yet."}
          </Text>
        </>
      ) : null}
      {tab === "clinical" ? (
        <>
          {hasVitals ? (
            <View style={styles.vitals}>
              {vitals
                .filter(([, v]) => v != null && v !== "")
                .map(([label, value]) => (
                  <Text key={label} style={styles.vital}>
                    {label} {String(value)}
                  </Text>
                ))}
            </View>
          ) : (
            <Text style={styles.muted}>No vitals recorded.</Text>
          )}
          <Text style={styles.block}>
            <Text style={styles.label}>Allergies. </Text>
            {allergyText || "No known allergy"}
          </Text>
          <Text style={styles.block}>
            <Text style={styles.label}>Pain. </Text>
            {painText || "No pain complaints recorded."}
          </Text>
        </>
      ) : null}
      {tab === "prescription" ? (
        medicines.length === 0 ? (
          <Text style={styles.muted}>No medicines prescribed.</Text>
        ) : (
          medicines.map((m, i) => (
            <Text key={`${m.name}-${i}`} style={styles.medName}>
              {i + 1}. {m.name}
            </Text>
          ))
        )
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: space.md },
  tabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: space.sm,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  tab: { flex: 1, borderRadius: 999, paddingVertical: 8, alignItems: "center" },
  tabOn: { backgroundColor: "#fff" },
  tabLabel: { fontSize: 13, fontWeight: "700", color: colors.inkSoft },
  tabLabelOn: { color: colors.ink },
  muted: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  label: { fontWeight: "700", color: colors.ink },
  block: { marginTop: space.sm, fontSize: 14, lineHeight: 20, color: colors.ink },
  vitals: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: space.sm },
  vital: {
    backgroundColor: "#F0F9FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
    overflow: "hidden",
  },
  med: { marginTop: space.sm },
  medName: { fontSize: 14, fontWeight: "700", color: colors.ink },
});
