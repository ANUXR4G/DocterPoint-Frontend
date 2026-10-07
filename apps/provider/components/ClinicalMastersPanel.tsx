import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Chip, ErrorText, PrimaryButton } from "@/components/ui";
import {
  DEFAULT_CLINICAL_MASTERS,
  mergeClinicalMasters,
  type AllergyMaster,
  type ClinicalMasters,
  type VitalMaster,
} from "@/lib/clinicalMasters";
import { updatePracticeProfile } from "@/lib/procto";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  practiceId: string;
  clinicalMasters?: unknown;
  onSaved?: () => void;
};

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ClinicalMastersPanel({
  practiceId,
  clinicalMasters,
  onSaved,
}: Props) {
  const seeded = useMemo(
    () => mergeClinicalMasters(clinicalMasters ?? DEFAULT_CLINICAL_MASTERS),
    [clinicalMasters],
  );
  const [vitals, setVitals] = useState<VitalMaster[]>(seeded.vitals);
  const [allergies, setAllergies] = useState<AllergyMaster[]>(seeded.allergies);
  const [painScales, setPainScales] = useState<string[]>(seeded.painScales);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next = mergeClinicalMasters(clinicalMasters ?? DEFAULT_CLINICAL_MASTERS);
    setVitals(next.vitals);
    setAllergies(next.allergies);
    setPainScales(next.painScales);
  }, [clinicalMasters]);

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    const payload: ClinicalMasters = { vitals, allergies, painScales };
    const res = await updatePracticeProfile(practiceId, {
      clinicalMasters: payload,
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not save clinical masters");
      return;
    }
    setMessage("Clinical masters saved.");
    onSaved?.();
  }

  function resetDefaults() {
    const d = mergeClinicalMasters(DEFAULT_CLINICAL_MASTERS);
    setVitals(d.vitals);
    setAllergies(d.allergies);
    setPainScales(d.painScales);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>Vitals thresholds</Text>
      <Text style={styles.hint}>
        Bands color-code visit vitals. BMI is calculated from height and weight.
      </Text>
      {vitals.map((v, idx) => (
        <View key={v.key} style={styles.card}>
          <Text style={styles.vitalTitle}>
            {v.label} ({v.unit})
            {v.derived ? " · auto" : ""}
          </Text>
          {(
            [
              ["criticalLow", "Crit. low"],
              ["low", "Low"],
              ["normalMin", "Normal min"],
              ["normalMax", "Normal max"],
              ["high", "High"],
              ["criticalHigh", "Crit. high"],
            ] as const
          ).map(([field, label]) => (
            <View key={field} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{label}</Text>
              <TextInput
                editable={!v.derived}
                keyboardType="decimal-pad"
                value={v[field] == null ? "" : String(v[field])}
                placeholder="—"
                placeholderTextColor={colors.inkFaint}
                onChangeText={(t) => {
                  const next = [...vitals];
                  next[idx] = { ...v, [field]: numOrNull(t) };
                  setVitals(next);
                }}
                style={[styles.input, v.derived && styles.readonly]}
              />
            </View>
          ))}
        </View>
      ))}

      <Text style={[styles.h2, { marginTop: space.lg }]}>Allergy catalog</Text>
      {allergies.map((a, idx) => (
        <View key={`${a.category}-${a.name}-${idx}`} style={styles.card}>
          <TextInput
            value={a.category}
            placeholder="Category"
            placeholderTextColor={colors.inkFaint}
            onChangeText={(t) => {
              const next = [...allergies];
              next[idx] = { ...a, category: t };
              setAllergies(next);
            }}
            style={styles.input}
          />
          <TextInput
            value={a.name}
            placeholder="Name"
            placeholderTextColor={colors.inkFaint}
            onChangeText={(t) => {
              const next = [...allergies];
              next[idx] = { ...a, name: t };
              setAllergies(next);
            }}
            style={styles.input}
          />
          <TextInput
            value={a.description}
            placeholder="Description"
            placeholderTextColor={colors.inkFaint}
            onChangeText={(t) => {
              const next = [...allergies];
              next[idx] = { ...a, description: t };
              setAllergies(next);
            }}
            style={styles.input}
          />
          <Chip
            label="Remove"
            onPress={() => setAllergies(allergies.filter((_, i) => i !== idx))}
          />
        </View>
      ))}
      <PrimaryButton
        label="Add allergy"
        onPress={() =>
          setAllergies((prev) => [
            ...prev,
            { category: "Others", name: "", description: "" },
          ])
        }
      />

      <Text style={[styles.h2, { marginTop: space.lg }]}>Pain scales</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {painScales.map((s) => (
            <Chip
              key={s}
              label={s}
              onPress={() =>
                setPainScales(painScales.filter((x) => x !== s))
              }
            />
          ))}
        </View>
      </ScrollView>
      <Text style={styles.hint}>Tap a scale to remove it.</Text>

      <ErrorText text={error} />
      {message ? <Text style={styles.ok}>{message}</Text> : null}

      <View style={styles.row}>
        <PrimaryButton
          label={busy ? "Saving…" : "Save clinical masters"}
          onPress={() => void save()}
          disabled={busy}
        />
        <Chip label="Reset defaults" onPress={resetDefaults} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  h2: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.paperRaised,
  },
  vitalTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  fieldLabel: { width: 88, fontSize: 12, color: colors.inkSoft, fontWeight: "600" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  ok: { fontSize: 13, fontWeight: "600", color: colors.success },
  readonly: { opacity: 0.6 },
});
