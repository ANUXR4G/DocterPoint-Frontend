import type { TPatient, TPatientHealth } from "@/types"

export type ProfileFieldKey =
  | "name"
  | "dateOfBirth"
  | "gender"
  | "profession"
  | "contactNumber"
  | "emergencyNumber"
  | "email"
  | "address"
  | "weight"
  | "height"
  | "bloodGroup"
  | "smokingStatus"
  | "physicalActivity"
  | "chronicConditions"

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  name: "Full name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  profession: "Profession",
  contactNumber: "Contact number",
  emergencyNumber: "Emergency contact",
  email: "Email",
  address: "Address",
  weight: "Weight",
  height: "Height",
  bloodGroup: "Blood group",
  smokingStatus: "Smoking status",
  physicalActivity: "Physical activity",
  chronicConditions: "Chronic conditions",
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "number") return !Number.isNaN(value)
  return String(value).trim() !== ""
}

export type ProfileCompletenessResult = {
  percent: number
  filled: number
  total: number
  missing: ProfileFieldKey[]
}

export function calculateProfileCompleteness(
  profile: TPatient,
  medical?: TPatientHealth | null,
): ProfileCompletenessResult {
  const checks: { key: ProfileFieldKey; filled: boolean }[] = [
    { key: "name", filled: isFilled(profile.name) },
    { key: "dateOfBirth", filled: isFilled(profile.dateOfBirth) },
    { key: "gender", filled: isFilled(profile.gender) },
    { key: "profession", filled: isFilled(profile.profession) },
    { key: "contactNumber", filled: isFilled(profile.contactNumber) },
    { key: "emergencyNumber", filled: isFilled(profile.emergencyNumber) },
    { key: "email", filled: isFilled(profile.email) },
    { key: "address", filled: isFilled(profile.address) },
    { key: "weight", filled: isFilled(medical?.weight) },
    { key: "height", filled: isFilled(medical?.height) },
    { key: "bloodGroup", filled: isFilled(medical?.blood_group) },
    { key: "smokingStatus", filled: isFilled(medical?.smoking_status) },
    { key: "physicalActivity", filled: isFilled(medical?.physical_activity) },
    {
      key: "chronicConditions",
      filled: isFilled(medical?.previous_diabetes_records),
    },
  ]

  const filled = checks.filter((c) => c.filled).length
  const total = checks.length
  const percent = Math.round((filled / total) * 100)
  const missing = checks.filter((c) => !c.filled).map((c) => c.key)

  return { percent, filled, total, missing }
}

/** Stroke/fill hex for pie chart arc. */
export function completenessChartColor(percent: number): string {
  if (percent < 50) return "#ef4444"
  if (percent < 70) return "#eab308"
  return "#22c55e"
}

export function completenessToneClasses(percent: number) {
  if (percent < 50) {
    return {
      text: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-900/40",
      ring: "ring-red-500/20",
    }
  }
  if (percent < 70) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-900/40",
      ring: "ring-amber-500/20",
    }
  }
  return {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-900/40",
    ring: "ring-emerald-500/20",
  }
}

export function completenessMessage(percent: number): string {
  if (percent < 50) {
    return "Add your basic details and medical history to complete your profile."
  }
  if (percent < 70) {
    return "You're making progress — fill in the remaining fields below."
  }
  if (percent < 100) {
    return "Almost there — just a few more details to reach 100%."
  }
  return "Your profile is fully complete."
}
