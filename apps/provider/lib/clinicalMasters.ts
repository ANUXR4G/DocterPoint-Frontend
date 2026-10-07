/** Platform defaults for vitals bands, allergy catalog, and pain scales. */

export type VitalBand =
  | "critical_low"
  | "low"
  | "normal"
  | "high"
  | "critical_high";

export type VitalMaster = {
  key: string;
  label: string;
  unit: string;
  /** Upper bound of critical-low band (exclusive of low). */
  criticalLow: number | null;
  /** Upper bound of low band (exclusive of normalMin). */
  low: number | null;
  normalMin: number | null;
  normalMax: number | null;
  /** Lower bound of high band (exclusive of normalMax). */
  high: number | null;
  /** Lower bound of critical-high band. */
  criticalHigh: number | null;
  /** When true, value is derived (e.g. BMI from Ht/Wt). */
  derived?: boolean;
};

export type AllergyMaster = {
  category: "Food" | "Drug" | "Respiratory" | "Others" | string;
  name: string;
  description: string;
};

export type ClinicalMasters = {
  vitals: VitalMaster[];
  allergies: AllergyMaster[];
  painScales: string[];
};

export const ALLERGY_SEVERITIES = [
  "Mild / Low",
  "Moderate",
  "Severe / High",
  "Not available",
] as const;

export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export const DEFAULT_PAIN_SCALES = [
  "Numeric (0–10)",
  "Wong-Baker Faces",
  "FLACC",
  "Verbal descriptor",
];

/** Adult default bands — clinics can override in Settings → Clinical. */
export const DEFAULT_VITAL_MASTERS: VitalMaster[] = [
  {
    key: "ht",
    label: "Ht",
    unit: "cm",
    criticalLow: 100,
    low: 140,
    normalMin: 140,
    normalMax: 200,
    high: 200,
    criticalHigh: 220,
  },
  {
    key: "wt",
    label: "Wt",
    unit: "kg",
    criticalLow: 30,
    low: 45,
    normalMin: 45,
    normalMax: 90,
    high: 90,
    criticalHigh: 120,
  },
  {
    key: "bmi",
    label: "BMI",
    unit: "kg/m²",
    criticalLow: 15,
    low: 18.5,
    normalMin: 18.5,
    normalMax: 24.9,
    high: 25,
    criticalHigh: 35,
    derived: true,
  },
  {
    key: "temp",
    label: "Temp",
    unit: "°C",
    criticalLow: 35,
    low: 36,
    normalMin: 36,
    normalMax: 37.5,
    high: 37.5,
    criticalHigh: 39,
  },
  {
    key: "pr",
    label: "PR",
    unit: "bpm",
    criticalLow: 40,
    low: 60,
    normalMin: 60,
    normalMax: 100,
    high: 100,
    criticalHigh: 130,
  },
  {
    key: "bp_sys",
    label: "BP Sys",
    unit: "mmHg",
    criticalLow: 80,
    low: 90,
    normalMin: 90,
    normalMax: 120,
    high: 120,
    criticalHigh: 180,
  },
  {
    key: "bp_dia",
    label: "BP Dia",
    unit: "mmHg",
    criticalLow: 50,
    low: 60,
    normalMin: 60,
    normalMax: 80,
    high: 80,
    criticalHigh: 120,
  },
  {
    key: "spo2",
    label: "SpO2",
    unit: "%",
    criticalLow: 85,
    low: 92,
    normalMin: 95,
    normalMax: 100,
    high: null,
    criticalHigh: null,
  },
  {
    key: "rr",
    label: "RR",
    unit: "bpm",
    criticalLow: 8,
    low: 12,
    normalMin: 12,
    normalMax: 20,
    high: 20,
    criticalHigh: 30,
  },
  {
    key: "rbs",
    label: "RBS",
    unit: "mg/dl",
    criticalLow: 50,
    low: 70,
    normalMin: 70,
    normalMax: 140,
    high: 140,
    criticalHigh: 250,
  },
];

export const DEFAULT_ALLERGY_MASTERS: AllergyMaster[] = [
  { category: "Food", name: "Peanuts", description: "Allergic reactions to peanuts." },
  { category: "Food", name: "Milk/Dairy", description: "Allergies to dairy products." },
  {
    category: "Food",
    name: "Shellfish",
    description: "Reactions to shellfish (e.g., shrimp).",
  },
  { category: "Food", name: "Eggs", description: "Allergies caused by eggs." },
  { category: "Food", name: "Wheat", description: "Reactions to wheat products." },
  { category: "Food", name: "Soy", description: "Reactions to soy products." },
  {
    category: "Food",
    name: "Tree Nuts",
    description: "Allergic to tree nuts (e.g., almonds, walnuts).",
  },
  { category: "Food", name: "Fish", description: "Reactions to finned fish." },
  {
    category: "Food",
    name: "Sesame",
    description: "Reactions to sesame seeds/oil.",
  },
  {
    category: "Drug",
    name: "Penicillin",
    description: "Allergies to penicillin-based drugs.",
  },
  { category: "Drug", name: "Aspirin", description: "Reactions to aspirin (NSAIDs)." },
  {
    category: "Drug",
    name: "Sulfa Drugs",
    description: "Allergic to sulfonamide antibiotics.",
  },
  { category: "Drug", name: "Ibuprofen", description: "Reactions to ibuprofen." },
  {
    category: "Drug",
    name: "Local Anesthesia",
    description: "Allergic to anesthetics.",
  },
  {
    category: "Drug",
    name: "Cephalosporins",
    description: "Allergic to cephalosporin antibiotics.",
  },
  {
    category: "Drug",
    name: "Anticonvulsants",
    description: "Reactions to seizure medications.",
  },
  {
    category: "Respiratory",
    name: "Pollen",
    description: "Seasonal reactions to pollen.",
  },
  {
    category: "Respiratory",
    name: "Dust Mites",
    description: "Allergic to dust mites.",
  },
  {
    category: "Respiratory",
    name: "Pet Dander",
    description: "Reactions to animal dander (cats, dogs, etc.).",
  },
  {
    category: "Respiratory",
    name: "Mold",
    description: "Allergic reactions to mold spores.",
  },
  {
    category: "Others",
    name: "No known allergy",
    description: "No known allergy.",
  },
];

export const DEFAULT_CLINICAL_MASTERS: ClinicalMasters = {
  vitals: DEFAULT_VITAL_MASTERS,
  allergies: DEFAULT_ALLERGY_MASTERS,
  painScales: [...DEFAULT_PAIN_SCALES],
};

function cloneMasters<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function mergeClinicalMasters(raw: unknown): ClinicalMasters {
  const base = DEFAULT_CLINICAL_MASTERS
  if (!raw || typeof raw !== "object") return cloneMasters(base)
  const o = raw as Partial<ClinicalMasters>
  return {
    vitals:
      Array.isArray(o.vitals) && o.vitals.length > 0
        ? (o.vitals as VitalMaster[])
        : cloneMasters(base.vitals),
    allergies:
      Array.isArray(o.allergies) && o.allergies.length > 0
        ? (o.allergies as AllergyMaster[])
        : cloneMasters(base.allergies),
    painScales:
      Array.isArray(o.painScales) && o.painScales.length > 0
        ? o.painScales.map(String)
        : [...base.painScales],
  }
}

/**
 * Classify a vital value into a band for UI coloring.
 * Boundaries: value < criticalLow → critical_low; < low → low;
 * within [normalMin, normalMax] → normal; >= criticalHigh → critical_high; else high/low.
 */
export function vitalsBand(
  value: number | null | undefined,
  m: VitalMaster,
): VitalBand | null {
  if (value == null || Number.isNaN(value)) return null;
  const v = value;
  if (m.criticalLow != null && v < m.criticalLow) return "critical_low";
  if (m.low != null && m.normalMin != null && v < m.normalMin) {
    if (m.criticalLow != null && v < m.low) return "low";
    if (v < m.normalMin) return "low";
  }
  if (
    m.normalMin != null &&
    m.normalMax != null &&
    v >= m.normalMin &&
    v <= m.normalMax
  ) {
    return "normal";
  }
  if (m.criticalHigh != null && v >= m.criticalHigh) return "critical_high";
  if (m.normalMax != null && v > m.normalMax) {
    if (m.criticalHigh != null && v >= m.criticalHigh) return "critical_high";
    return "high";
  }
  if (m.normalMin != null && v < m.normalMin) return "low";
  return "normal";
}

export function computeBmi(htCm: number | null, wtKg: number | null): number | null {
  if (htCm == null || wtKg == null || htCm <= 0 || wtKg <= 0) return null;
  const m = htCm / 100;
  const bmi = wtKg / (m * m);
  return Math.round(bmi * 10) / 10;
}

export type ClinicalAssessment = {
  vitals?: {
    breakfast?: boolean | null;
    values?: Record<string, number | null>;
    recordedAt?: string | null;
  } | null;
  pain?: Array<{
    scale?: string;
    score?: string;
    location?: string;
    type?: string;
    duration?: string;
    frequency?: string;
    radiation?: string;
  }>;
  allergies?: Array<{
    category?: string;
    name?: string;
    severity?: string;
    active?: string;
    description?: string;
  }>;
  noKnownAllergies?: boolean;
};

export function normalizeClinicalAssessment(
  raw: unknown,
): ClinicalAssessment | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const o = raw as ClinicalAssessment;
  const values: Record<string, number | null> = {};
  if (o.vitals?.values && typeof o.vitals.values === "object") {
    for (const [k, v] of Object.entries(o.vitals.values)) {
      if (v == null || v === ("" as unknown)) {
        values[k] = null;
      } else {
        const n = typeof v === "number" ? v : Number(v);
        values[k] = Number.isFinite(n) ? n : null;
      }
    }
  }
  const pain = Array.isArray(o.pain)
    ? o.pain.map((row) => ({
        scale: String(row?.scale ?? "").trim(),
        score: String(row?.score ?? "").trim(),
        location: String(row?.location ?? "").trim(),
        type: String(row?.type ?? "").trim(),
        duration: String(row?.duration ?? "").trim(),
        frequency: String(row?.frequency ?? "").trim(),
        radiation: String(row?.radiation ?? "").trim(),
      }))
    : [];
  const allergies = Array.isArray(o.allergies)
    ? o.allergies.map((row) => ({
        category: String(row?.category ?? "").trim(),
        name: String(row?.name ?? "").trim(),
        severity: String(row?.severity ?? "").trim(),
        active: String(row?.active ?? "").trim(),
        description: String(row?.description ?? "").trim(),
      }))
    : [];
  return {
    vitals: o.vitals
      ? {
          breakfast:
            typeof o.vitals.breakfast === "boolean"
              ? o.vitals.breakfast
              : o.vitals.breakfast == null
                ? null
                : Boolean(o.vitals.breakfast),
          values,
          recordedAt: o.vitals.recordedAt
            ? String(o.vitals.recordedAt)
            : null,
        }
      : null,
    pain,
    allergies,
    noKnownAllergies: Boolean(o.noKnownAllergies),
  };
}
