import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Chip, PrimaryButton } from "@/components/ui";
import PainAssessmentToolModal from "@/components/PainAssessmentToolModal";
import {
  ALLERGY_SEVERITIES,
  computeBmi,
  mergeClinicalMasters,
  normalizeClinicalAssessment,
  vitalsBand,
  type ClinicalAssessment,
  type VitalBand,
} from "@/lib/clinicalMasters";
import {
  painToolTabForScale,
  shouldOpenPainAssessmentTool,
  type PainToolTab,
} from "@/lib/painAssessmentTool";
import { colors, radii, space } from "@/lib/theme";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import {
  PAIN_DURATION_PRESETS,
  PAIN_DURATION_UNITS,
  PAIN_FREQUENCIES,
  PAIN_LOCATION_GROUPS,
  PAIN_RADIATIONS,
  PAIN_TYPES,
} from "@/lib/painCatalog";

const BAND_BG: Record<VitalBand, string> = {
  critical_low: "#E0F2FE",
  low: "#E0E7FF",
  normal: "#D1FAE5",
  high: "#FFE4E6",
  critical_high: "#FECACA",
};

const BAND_BORDER: Record<VitalBand, string> = {
  critical_low: "#38BDF8",
  low: "#818CF8",
  normal: "#34D399",
  high: "#FB7185",
  critical_high: "#EF4444",
};

const BAND_LEGEND: Array<{ key: VitalBand; label: string; bg: string }> = [
  { key: "critical_low", label: "Crit. low", bg: BAND_BG.critical_low },
  { key: "low", label: "Low", bg: BAND_BG.low },
  { key: "normal", label: "Normal", bg: BAND_BG.normal },
  { key: "high", label: "High", bg: BAND_BG.high },
  { key: "critical_high", label: "Crit. high", bg: BAND_BG.critical_high },
];

type PainRow = NonNullable<ClinicalAssessment["pain"]>[number];
type AllergyRow = NonNullable<ClinicalAssessment["allergies"]>[number];

type Props = {
  mastersRaw?: unknown;
  value: ClinicalAssessment | null;
  readOnly?: boolean;
  onChange: (next: ClinicalAssessment) => void;
};

function emptyPain(): PainRow {
  return {
    scale: "",
    score: "",
    location: "",
    type: "",
    duration: "",
    frequency: "",
    radiation: "",
  };
}

function emptyAllergy(): AllergyRow {
  return {
    category: "",
    name: "",
    severity: "",
    active: "",
    description: "",
  };
}

function emptyAssessment(): ClinicalAssessment {
  return {
    vitals: { breakfast: null, values: {} },
    pain: [emptyPain()],
    allergies: [],
    noKnownAllergies: false,
  };
}

export function ClinicalAssessmentPanel({
  mastersRaw,
  value,
  readOnly,
  onChange,
}: Props) {
  const masters = useMemo(
    () => mergeClinicalMasters(mastersRaw),
    [mastersRaw],
  );
  const [local, setLocal] = useState<ClinicalAssessment>(
    () => normalizeClinicalAssessment(value) ?? emptyAssessment(),
  );
  const [painTool, setPainTool] = useState<{
    idx: number;
    tab: PainToolTab;
  } | null>(null);
  const valueKey = useMemo(() => JSON.stringify(value ?? null), [value]);

  useEffect(() => {
    const next = normalizeClinicalAssessment(value) ?? emptyAssessment();
    setLocal((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [valueKey]);

  function commit(next: ClinicalAssessment) {
    setLocal(next);
    onChange(next);
  }

  const values = local.vitals?.values ?? {};
  const ht = values.ht ?? null;
  const wt = values.wt ?? null;
  const bmiAuto = computeBmi(ht, wt);

  function setVital(key: string, raw: string) {
    const n = raw.trim() === "" ? null : Number(raw);
    const nextValues = {
      ...values,
      [key]: n != null && Number.isFinite(n) ? n : null,
    };
    if (key === "ht" || key === "wt") {
      nextValues.bmi = computeBmi(
        key === "ht" ? (nextValues.ht ?? null) : ht,
        key === "wt" ? (nextValues.wt ?? null) : wt,
      );
    }
    commit({
      ...local,
      vitals: {
        ...local.vitals,
        breakfast: local.vitals?.breakfast ?? null,
        values: nextValues,
        recordedAt: new Date().toISOString(),
      },
    });
  }

  function setBreakfast(v: boolean) {
    commit({
      ...local,
      vitals: {
        ...local.vitals,
        values: { ...values },
        breakfast: v,
        recordedAt: local.vitals?.recordedAt ?? new Date().toISOString(),
      },
    });
  }

  function setNoKnownAllergies() {
    commit({
      ...local,
      noKnownAllergies: true,
      allergies: [
        {
          category: "Others",
          name: "No known allergy",
          severity: "Not available",
          active: "No",
          description: "No known allergy",
        },
      ],
    });
  }

  const interpretation = useMemo(() => {
    const bands = masters.vitals
      .map((m) => {
        const v = m.key === "bmi" ? (values.bmi ?? bmiAuto) : values[m.key];
        return vitalsBand(v ?? null, m);
      })
      .filter(Boolean) as VitalBand[];
    if (!bands.length) return "—";
    if (bands.some((b) => b === "critical_high" || b === "critical_low")) {
      return "Critical";
    }
    if (bands.some((b) => b === "high" || b === "low")) return "Abnormal";
    return "Normal";
  }, [masters.vitals, values, bmiAuto]);

  const allergyNames = useMemo(() => {
    const byCat = new Map<string, string[]>();
    for (const a of masters.allergies) {
      const list = byCat.get(a.category) ?? [];
      list.push(a.name);
      byCat.set(a.category, list);
    }
    return byCat;
  }, [masters.allergies]);

  const categories = useMemo(
    () => Array.from(new Set(masters.allergies.map((a) => a.category))),
    [masters.allergies],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>Vitals</Text>
      {value?.savedAt || value?.vitals?.recordedAt ? (
        <Text style={styles.meta}>
          Saved{" "}
          {formatPracticeDateTime(
            value.savedAt || value.vitals?.recordedAt || "",
          )}
        </Text>
      ) : null}
      <View style={styles.legendRow}>
        {BAND_LEGEND.map((b) => (
          <View key={b.key} style={[styles.legendChip, { backgroundColor: b.bg }]}>
            <Text style={styles.legendText}>{b.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.label}>Breakfast this morning?</Text>
      <View style={styles.row}>
        {([false, true] as const).map((v) => (
          <Chip
            key={String(v)}
            label={v ? "Yes" : "No"}
            active={local.vitals?.breakfast === v}
            onPress={readOnly ? undefined : () => setBreakfast(v)}
          />
        ))}
        <Text style={styles.interp}>Interp: {interpretation}</Text>
      </View>

      <View style={styles.vitalsGrid}>
        {masters.vitals.map((m) => {
          const rawVal =
            m.key === "bmi" ? (values.bmi ?? bmiAuto) : values[m.key];
          const band = vitalsBand(rawVal ?? null, m);
          return (
            <View key={m.key} style={styles.vitalCell}>
              <Text style={styles.vitalLabel}>
                {m.label} ({m.unit})
              </Text>
              <TextInput
                keyboardType="decimal-pad"
                editable={!readOnly && !m.derived}
                value={rawVal == null ? "" : String(rawVal)}
                placeholder="—"
                placeholderTextColor={colors.inkFaint}
                onChangeText={(t) => setVital(m.key, t)}
                style={[
                  styles.vitalInput,
                  band
                    ? {
                        backgroundColor: BAND_BG[band],
                        borderColor: BAND_BORDER[band],
                        borderWidth: 2,
                      }
                    : null,
                  (readOnly || m.derived) && styles.readonly,
                ]}
              />
            </View>
          );
        })}
      </View>

      <Text style={[styles.h2, { marginTop: space.lg }]}>Pain</Text>
      {(local.pain ?? []).map((row, idx) => (
        <View key={idx} style={styles.card}>
          <Text style={styles.meta}>#{idx + 1}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {masters.painScales.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={row.scale === s}
                  onPress={
                    readOnly
                      ? undefined
                      : () => {
                          const pain = [...(local.pain ?? [])];
                          pain[idx] = { ...row, scale: s };
                          commit({ ...local, pain });
                          const tab = painToolTabForScale(s);
                          if (tab) setPainTool({ idx, tab });
                        }
                  }
                />
              ))}
            </View>
          </ScrollView>
          {shouldOpenPainAssessmentTool(row.scale || "") && !readOnly ? (
            <Pressable
              onPress={() => {
                const tab =
                  painToolTabForScale(row.scale || "") ?? "wong-baker";
                setPainTool({ idx, tab });
              }}
              style={[styles.input, styles.scoreToolBtn]}
            >
              <Text
                style={
                  row.score ? styles.scoreToolValue : styles.scoreToolPlaceholder
                }
              >
                {row.score || "Select with tool…"}
              </Text>
            </Pressable>
          ) : (
            <TextInput
              editable={!readOnly}
              value={String(row.score ?? "")}
              placeholder="Score"
              placeholderTextColor={colors.inkFaint}
              onChangeText={(t) => {
                const pain = [...(local.pain ?? [])];
                pain[idx] = { ...row, score: t };
                commit({ ...local, pain });
              }}
              style={styles.input}
            />
          )}
          <Text style={styles.label}>Location</Text>
          {PAIN_LOCATION_GROUPS.map((g) => (
            <View key={g.group}>
              <Text style={styles.meta}>{g.group}</Text>
              <View style={styles.row}>
                {g.options.map((o) => (
                  <Chip
                    key={o}
                    label={o}
                    active={row.location === o}
                    onPress={
                      readOnly
                        ? undefined
                        : () => {
                            const pain = [...(local.pain ?? [])];
                            pain[idx] = { ...row, location: o };
                            commit({ ...local, pain });
                          }
                    }
                  />
                ))}
              </View>
            </View>
          ))}
          {(
            [
              ["type", "Type", PAIN_TYPES],
              ["frequency", "Frequency", PAIN_FREQUENCIES],
              ["radiation", "Radiation", PAIN_RADIATIONS],
            ] as const
          ).map(([field, label, choices]) => (
            <View key={field}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.row}>
                {choices.map((c) => (
                  <Chip
                    key={c.label}
                    label={c.label}
                    active={row[field] === c.label}
                    onPress={
                      readOnly
                        ? undefined
                        : () => {
                            const pain = [...(local.pain ?? [])];
                            pain[idx] = { ...row, [field]: c.label };
                            commit({ ...local, pain });
                          }
                    }
                  />
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.label}>Duration</Text>
          <View style={styles.row}>
            {PAIN_DURATION_PRESETS.map((p) => (
              <Chip
                key={p}
                label={p}
                active={row.duration === p}
                onPress={
                  readOnly
                    ? undefined
                    : () => {
                        const pain = [...(local.pain ?? [])];
                        pain[idx] = { ...row, duration: p };
                        commit({ ...local, pain });
                      }
                }
              />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              editable={!readOnly}
              keyboardType="number-pad"
              value={
                /^(\d+)\s+(Hours|Days|Weeks|Months)$/.exec(row.duration || "")?.[1] ??
                ""
              }
              placeholder="Number"
              placeholderTextColor={colors.inkFaint}
              onChangeText={(t) => {
                const n = t.replace(/\D/g, "").slice(0, 3);
                const unit =
                  /^(\d+)\s+(Hours|Days|Weeks|Months)$/.exec(row.duration || "")?.[2] ??
                  "Days";
                const pain = [...(local.pain ?? [])];
                pain[idx] = { ...row, duration: n ? `${n} ${unit}` : "" };
                commit({ ...local, pain });
              }}
              style={[styles.input, { width: 88 }]}
            />
            {PAIN_DURATION_UNITS.map((u) => (
              <Chip
                key={u}
                label={u}
                active={
                  /^(\d+)\s+(Hours|Days|Weeks|Months)$/.exec(row.duration || "")?.[2] ===
                  u
                }
                onPress={
                  readOnly
                    ? undefined
                    : () => {
                        const n =
                          /^(\d+)\s+(Hours|Days|Weeks|Months)$/.exec(
                            row.duration || "",
                          )?.[1] ?? "";
                        if (!n) return;
                        const pain = [...(local.pain ?? [])];
                        pain[idx] = { ...row, duration: `${n} ${u}` };
                        commit({ ...local, pain });
                      }
                }
              />
            ))}
          </View>
          {!readOnly ? (
            <Chip
              label="Remove pain row"
              onPress={() => {
                const pain = (local.pain ?? []).filter((_, i) => i !== idx);
                commit({ ...local, pain: pain.length ? pain : [emptyPain()] });
              }}
            />
          ) : null}
        </View>
      ))}
      {!readOnly ? (
        <PrimaryButton
          label="Add pain row"
          onPress={() =>
            commit({
              ...local,
              pain: [...(local.pain ?? []), emptyPain()],
            })
          }
        />
      ) : null}

      <View style={styles.allergyHead}>
        <Text style={styles.h2}>Allergies</Text>
        {!readOnly ? (
          <Chip label="No known allergies" onPress={setNoKnownAllergies} />
        ) : null}
      </View>
      {(local.allergies ?? []).map((row, idx) => (
        <View key={idx} style={styles.card}>
          <Text style={styles.meta}>#{idx + 1}</Text>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {categories.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={row.category === c}
                  onPress={
                    readOnly
                      ? undefined
                      : () => {
                          const allergies = [...(local.allergies ?? [])];
                          allergies[idx] = {
                            ...row,
                            category: c,
                            name: "",
                          };
                          commit({
                            ...local,
                            allergies,
                            noKnownAllergies: false,
                          });
                        }
                  }
                />
              ))}
            </View>
          </ScrollView>
          {row.category ? (
            <>
              <Text style={styles.label}>Name</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.row}>
                  {(allergyNames.get(row.category) ?? []).map((n) => (
                    <Chip
                      key={n}
                      label={n}
                      active={row.name === n}
                      onPress={
                        readOnly
                          ? undefined
                          : () => {
                              const allergies = [...(local.allergies ?? [])];
                              allergies[idx] = { ...row, name: n };
                              commit({
                                ...local,
                                allergies,
                                noKnownAllergies: false,
                              });
                            }
                      }
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}
          <Text style={styles.label}>Severity</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {ALLERGY_SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={row.severity === s}
                  onPress={
                    readOnly
                      ? undefined
                      : () => {
                          const allergies = [...(local.allergies ?? [])];
                          allergies[idx] = { ...row, severity: s };
                          commit({ ...local, allergies });
                        }
                  }
                />
              ))}
            </View>
          </ScrollView>
          <Text style={styles.label}>Active</Text>
          <View style={styles.row}>
            {["Yes", "No"].map((a) => (
              <Chip
                key={a}
                label={a}
                active={row.active === a}
                onPress={
                  readOnly
                    ? undefined
                    : () => {
                        const allergies = [...(local.allergies ?? [])];
                        allergies[idx] = { ...row, active: a };
                        commit({ ...local, allergies });
                      }
                }
              />
            ))}
          </View>
          <TextInput
            editable={!readOnly}
            value={String(row.description ?? "")}
            placeholder="Description"
            placeholderTextColor={colors.inkFaint}
            onChangeText={(t) => {
              const allergies = [...(local.allergies ?? [])];
              allergies[idx] = { ...row, description: t };
              commit({ ...local, allergies });
            }}
            style={styles.input}
          />
          {!readOnly ? (
            <Chip
              label="Remove allergy"
              onPress={() => {
                const allergies = (local.allergies ?? []).filter(
                  (_, i) => i !== idx,
                );
                commit({ ...local, allergies });
              }}
            />
          ) : null}
        </View>
      ))}
      {!readOnly ? (
        <PrimaryButton
          label="Add allergy"
          onPress={() =>
            commit({
              ...local,
              noKnownAllergies: false,
              allergies: [...(local.allergies ?? []), emptyAllergy()],
            })
          }
        />
      ) : null}

      <PainAssessmentToolModal
        open={painTool != null}
        initialTab={painTool?.tab ?? "wong-baker"}
        initialScore={
          painTool != null ? local.pain?.[painTool.idx]?.score || "" : ""
        }
        onClose={() => setPainTool(null)}
        onSave={(sel) => {
          if (painTool == null) return;
          const pain = [...(local.pain ?? [])];
          const row = pain[painTool.idx];
          if (!row) {
            setPainTool(null);
            return;
          }
          const scale =
            painToolTabForScale(row.scale || "") === sel.tab
              ? row.scale
              : masters.painScales.find(
                  (s) => painToolTabForScale(s) === sel.tab,
                ) ?? sel.scale;
          pain[painTool.idx] = {
            ...row,
            scale,
            score: sel.score,
          };
          commit({ ...local, pain });
          setPainTool(null);
        }}
      />
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
    letterSpacing: 0.6,
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  legendChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  legendText: { fontSize: 10, fontWeight: "700", color: colors.ink },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
    marginTop: space.xs,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  interp: { fontSize: 12, fontWeight: "700", color: colors.ink },
  vitalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  vitalCell: { width: "30%", minWidth: 96, flexGrow: 1 },
  vitalLabel: { fontSize: 11, fontWeight: "700", color: colors.inkSoft },
  vitalInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    backgroundColor: colors.white,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.paperRaised,
  },
  input: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  scoreToolBtn: {
    justifyContent: "center",
    borderColor: "#99F6E4",
  },
  scoreToolValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  scoreToolPlaceholder: {
    fontSize: 14,
    color: colors.inkFaint,
  },
  meta: { fontSize: 12, color: colors.inkFaint, fontWeight: "600" },
  allergyHead: {
    marginTop: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  readonly: { opacity: 0.7 },
});
