import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCareTheme } from "@/lib/careTheme";
import { chiefComplaintOf } from "@/lib/bookingStats";
import { sharePrescriptionPdf } from "@/lib/sharePrescription";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import { colors, shadows, space } from "@/lib/theme";
import type { BookingDetail } from "@/lib/types";

type Pain = {
  scale?: string;
  score?: string;
  location?: string;
  type?: string;
  duration?: string;
  frequency?: string;
  radiation?: string;
};
type Allergy = {
  category?: string;
  name?: string;
  severity?: string;
  active?: string;
  description?: string;
};
type Assessment = {
  savedAt?: string | null;
  noKnownAllergies?: boolean;
  vitals?: {
    breakfast?: boolean | null;
    recordedAt?: string | null;
    values?: Record<string, number | null>;
  };
  pain?: Pain[];
  allergies?: Allergy[];
};

const PAIN_COLUMNS: Array<{ key: keyof Pain; label: string; width: number }> = [
  { key: "scale", label: "Pain scale", width: 148 },
  { key: "score", label: "Score", width: 88 },
  { key: "location", label: "Location", width: 120 },
  { key: "type", label: "Type", width: 110 },
  { key: "duration", label: "Duration", width: 110 },
  { key: "frequency", label: "Frequency", width: 120 },
  { key: "radiation", label: "Radiation", width: 120 },
];

const ALLERGY_COLUMNS: Array<{ key: keyof Allergy; label: string; width: number }> = [
  { key: "category", label: "Category", width: 120 },
  { key: "name", label: "Name", width: 140 },
  { key: "severity", label: "Severity", width: 110 },
  { key: "active", label: "Active", width: 80 },
  { key: "description", label: "Description", width: 160 },
];

type VisitTab = "vitals" | "pain" | "allergies";

const TABS: Array<[VisitTab, string]> = [
  ["vitals", "Vitals"],
  ["pain", "Pain assessment"],
  ["allergies", "Allergies"],
];

function asAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Assessment;
}

function dash(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}

function withUnit(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${value} ${unit}`;
}

/** One reading of the doctor visit. Empty fields are a dash. */
export function VisitRx({ booking }: { booking: BookingDetail }) {
  const { theme } = useCareTheme();
  const [tab, setTab] = useState<VisitTab>("vitals");
  const [recordOpen, setRecordOpen] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const assessment = asAssessment(booking.clinicalAssessment);
  const values = assessment?.vitals?.values ?? {};
  const allergies = (assessment?.allergies ?? []).filter((row) =>
    [row.category, row.name, row.severity, row.description].some((part) => part?.trim()),
  );
  const pain = (assessment?.pain ?? []).filter((row) =>
    [row.scale, row.score, row.location, row.type, row.duration, row.frequency, row.radiation].some(
      (part) => part?.trim(),
    ),
  );
  const breakfast =
    assessment?.vitals?.breakfast === true
      ? "Yes"
      : assessment?.vitals?.breakfast === false
        ? "No"
        : "—";
  const recorded =
    assessment?.savedAt || assessment?.vitals?.recordedAt
      ? formatPracticeDateTime(
          assessment?.savedAt || assessment?.vitals?.recordedAt || "",
        )
      : "";

  const bloodPressure =
    values.bp_sys != null || values.bp_dia != null
      ? `${values.bp_sys ?? "—"}/${values.bp_dia ?? "—"} mmHg`
      : "—";
  const vitalRows: Array<[string, string]> = [
    ["Breakfast", breakfast],
    ["Height", withUnit(values.ht, "cm")],
    ["Weight", withUnit(values.wt, "kg")],
    ["BMI", withUnit(values.bmi, "kg/m²")],
    ["Temperature", withUnit(values.temp, "°C")],
    ["Pulse", withUnit(values.pr, "bpm")],
    ["Blood pressure", bloodPressure],
    ["SpO2", withUnit(values.spo2, "%")],
    ["Respiration", withUnit(values.rr, "bpm")],
    ["RBS", withUnit(values.rbs, "mg/dl")],
  ];

  async function download() {
    setDownloadError("");
    try {
      await sharePrescriptionPdf(booking);
    } catch {
      setDownloadError("Could not download the prescription.");
    }
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.card }]}>
      <Pressable
        onPress={() => setRecordOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: recordOpen }}
        style={styles.disclosure}
      >
        <Text style={[styles.title, { color: theme.ink, marginBottom: 0 }]}>Visit record</Text>
        <Text style={[styles.chevron, { color: theme.ink }]}>{recordOpen ? "▾" : "▸"}</Text>
      </Pressable>
      {recordOpen ? (
      <>
      <Field label="Chief complaint" value={dash(chiefComplaintOf(booking))} ink={theme.ink} muted={theme.muted} />
      <Field label="Remarks" value={dash(booking.doctorRemarks)} ink={theme.ink} muted={theme.muted} />
      <Field label="Recorded" value={dash(recorded)} ink={theme.ink} muted={theme.muted} />

      <View
        style={[styles.tabs, { borderColor: theme.line, backgroundColor: theme.paper }]}
        accessibilityRole="tablist"
      >
        {TABS.map(([id, label]) => {
          const active = tab === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(id)}
              style={[styles.tab, active && { backgroundColor: theme.ink }]}
            >
              <Text
                style={[styles.tabLabel, { color: active ? colors.white : theme.ink }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "vitals" ? (
        <View>
          <Text style={[styles.section, { color: theme.ink }]}>Vitals</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.painHead}>
                <Text style={[styles.painHeadText, styles.painSno]}>S.No</Text>
                {vitalRows.map(([label]) => (
                  <Text key={label} style={[styles.painHeadText, { width: vitalWidth(label) }]}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.painRow}>
                <Text style={[styles.painCell, styles.painSno, { color: theme.ink }]}>1</Text>
                {vitalRows.map(([label, value]) => (
                  <Text
                    key={label}
                    style={[styles.painCell, { width: vitalWidth(label), color: theme.ink }]}
                  >
                    {value}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {tab === "pain" ? (
        <View>
          <Text style={[styles.section, { color: theme.ink }]}>Pain assessment</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.painHead}>
                <Text style={[styles.painHeadText, styles.painSno]}>S.No</Text>
                {PAIN_COLUMNS.map((col) => (
                  <Text key={col.key} style={[styles.painHeadText, { width: col.width }]}>
                    {col.label}
                  </Text>
                ))}
              </View>
              {(pain.length ? pain : [{}]).map((row, i) => (
                <View key={`pain-${i}`} style={styles.painRow}>
                  <Text style={[styles.painCell, styles.painSno, { color: theme.ink }]}>{i + 1}</Text>
                  {PAIN_COLUMNS.map((col) => (
                    <Text
                      key={col.key}
                      style={[styles.painCell, { width: col.width, color: theme.ink }]}
                    >
                      {dash(row[col.key])}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {tab === "allergies" ? (
        <View>
          <Text style={[styles.section, { color: theme.ink }]}>Allergies</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.painHead}>
                <Text style={[styles.painHeadText, styles.painSno]}>S.No</Text>
                {ALLERGY_COLUMNS.map((col) => (
                  <Text key={col.key} style={[styles.painHeadText, { width: col.width }]}>
                    {col.label}
                  </Text>
                ))}
              </View>
              {(allergies.length
                ? allergies
                : assessment?.noKnownAllergies
                  ? [{ name: "No known allergy", category: "Others", severity: "Not available", active: "No", description: "No known allergy" }]
                  : [{}]
              ).map((row, i) => (
                <View key={`allergy-${i}`} style={styles.painRow}>
                  <Text style={[styles.painCell, styles.painSno, { color: theme.ink }]}>{i + 1}</Text>
                  {ALLERGY_COLUMNS.map((col) => (
                    <Text
                      key={col.key}
                      style={[styles.painCell, { width: col.width, color: theme.ink }]}
                    >
                      {dash(row[col.key])}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void download()}
        style={[styles.download, { backgroundColor: theme.ink }]}
      >
        <Text style={styles.downloadText}>Download prescription</Text>
      </Pressable>
      {downloadError ? <Text style={styles.error}>{downloadError}</Text> : null}
      </>
      ) : null}
    </View>
  );
}

function vitalWidth(label: string): number {
  if (label === "Blood pressure" || label === "Temperature") return 140;
  if (label === "Respiration" || label === "Breakfast") return 110;
  return 88;
}

function Field({
  label,
  value,
  ink,
  muted,
}: {
  label: string;
  value: string;
  ink: string;
  muted: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginBottom: space.md,
    borderRadius: 26,
    padding: space.lg,
    ...shadows.soft,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevron: { fontSize: 16, fontWeight: "700" },
  tabs: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
    marginTop: space.md,
    padding: 4,
    borderWidth: 1,
    borderRadius: 14,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  section: {
    marginTop: space.md,
    marginBottom: space.sm,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  painHead: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingBottom: 6 },
  painHeadText: { fontSize: 11, fontWeight: "800", color: "#5B6B76" },
  painRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  painSno: { width: 36 },
  painCell: { fontSize: 14, fontWeight: "600" },
  row: { marginTop: space.sm },
  rowLabel: { fontSize: 12, fontWeight: "700" },
  rowValue: { marginTop: 2, fontSize: 15, lineHeight: 21 },
  download: {
    marginTop: space.lg,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  downloadText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  error: { marginTop: space.sm, color: "#b91c1c", fontSize: 13 },
});
