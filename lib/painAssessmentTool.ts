/** Shared data for the Pain Assessment Tool modal (Linear / Activity / Wong-Baker). */

export type PainToolTab = "linear" | "activity" | "wong-baker"

export type PainToolOption = {
  id: string
  label: string
  /** Value written to the pain row `score` field */
  score: string
  /** Face / chip color (Wong-Baker) */
  color?: string
}

export const PAIN_TOOL_TABS: Array<{
  id: PainToolTab
  label: string
  /** Canonical scale name stored on the pain row */
  scaleName: string
}> = [
  {
    id: "linear",
    label: "Linear Pain Scale",
    scaleName: "Linear Pain Scale",
  },
  {
    id: "activity",
    label: "Activity Tolerance Scale",
    scaleName: "Activity Tolerance Scale",
  },
  {
    id: "wong-baker",
    label: "Wong-Baker Facial Expression Scale",
    scaleName: "Wong-Baker Facial Expression Scale",
  },
]

/** Linear scale 1–10 (matches Pain Assessment Tool slider UI). */
export const LINEAR_OPTIONS: PainToolOption[] = [
  { id: "1", label: "1", score: "1" },
  { id: "2", label: "2", score: "2" },
  { id: "3", label: "3", score: "3" },
  { id: "4", label: "4", score: "4" },
  { id: "5", label: "5", score: "5" },
  { id: "6", label: "6", score: "6" },
  { id: "7", label: "7", score: "7" },
  { id: "8", label: "8", score: "8" },
  { id: "9", label: "9", score: "9" },
  { id: "10", label: "10", score: "10" },
]

/** Activity tolerance chips matching the Pain Assessment Tool screenshot. */
export const ACTIVITY_OPTIONS: PainToolOption[] = [
  { id: "ignored", label: "Can be ignored", score: "Can be ignored" },
  {
    id: "tasks",
    label: "Interferes with tasks",
    score: "Interferes with tasks",
  },
  {
    id: "concentration",
    label: "Interferes with concentration",
    score: "Interferes with concentration",
  },
  {
    id: "basic-needs",
    label: "Interferes with basic needs",
    score: "Interferes with basic needs",
  },
  { id: "bedrest", label: "Bedrest required", score: "Bedrest required" },
]

/** Five faces matching the Pain Assessment Tool screenshot (Mild → Worst Pain). */
export const WONG_BAKER_OPTIONS: PainToolOption[] = [
  {
    id: "mild",
    label: "Mild",
    score: "Mild (2)",
    color: "#22C55E",
  },
  {
    id: "moderate",
    label: "Moderate",
    score: "Moderate (4)",
    color: "#3B82F6",
  },
  {
    id: "moderate-high",
    label: "Moderate-High",
    score: "Moderate-High (6)",
    color: "#F59E0B",
  },
  {
    id: "severe",
    label: "Severe",
    score: "Severe (8)",
    color: "#F97316",
  },
  {
    id: "worst",
    label: "Worst Pain",
    score: "Worst Pain (10)",
    color: "#EF4444",
  },
]

export function optionsForTab(tab: PainToolTab): PainToolOption[] {
  if (tab === "linear") return LINEAR_OPTIONS
  if (tab === "activity") return ACTIVITY_OPTIONS
  return WONG_BAKER_OPTIONS
}

export function scaleNameForTab(tab: PainToolTab): string {
  return PAIN_TOOL_TABS.find((t) => t.id === tab)?.scaleName ?? "Pain scale"
}

/** Map a clinic pain-scale string to a tool tab (null = not a visual tool). */
export function painToolTabForScale(scale: string): PainToolTab | null {
  const s = scale.trim().toLowerCase()
  if (!s) return null
  if (/wong|baker|facial|faces/.test(s)) return "wong-baker"
  if (/activity.?toleranc/.test(s)) return "activity"
  if (/linear|numeric|0\s*[–-]\s*10|vas|visual.?analog/.test(s)) return "linear"
  return null
}

/** Prefer opening the tool for Wong-Baker / facial scales (and related tool scales). */
export function shouldOpenPainAssessmentTool(scale: string): boolean {
  return painToolTabForScale(scale) !== null
}
