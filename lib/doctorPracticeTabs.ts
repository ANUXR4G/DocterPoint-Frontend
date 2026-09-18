export type PracticeTab =
  | "calendar"
  | "setup"
  | "doctors"
  | "inbox"

/** In-page tabs under Settings → Practice (sidebar label: Practice). */
export const PRACTICE_TAB_LABELS: Record<PracticeTab, string> = {
  calendar: "Schedule",
  setup: "Hours & blocks",
  doctors: "Doctors",
  inbox: "WhatsApp",
}

/** Standalone doctor/clinic patients page (not under Settings). */
export const DOCTOR_PATIENTS_HREF = "/doctor/patients"

export const DOCTOR_SUBSCRIPTION_HREF = "/doctor/subscription"
export const CLINIC_SUBSCRIPTION_HREF = "/clinic/subscription"

export function practiceTabHref(
  tab: PracticeTab | "patients",
  opts?: { doctorId?: string },
): string {
  if (tab === "patients") return DOCTOR_PATIENTS_HREF
  const doctorQs =
    opts?.doctorId?.trim()
      ? `&doctor=${encodeURIComponent(opts.doctorId.trim())}`
      : ""
  return `/settings?tab=practice&subtab=${tab}${doctorQs}`
}

/** Legacy `/doctor/practice?tab=` URLs → settings practice panel. */
export function legacyPracticeTabHref(tab: string): string {
  const normalized =
    tab === "schedule" || tab === "overrides" ? "setup" : tab
  if (normalized === "patients") return DOCTOR_PATIENTS_HREF
  if (
    normalized === "calendar" ||
    normalized === "setup" ||
    normalized === "doctors" ||
    normalized === "inbox"
  ) {
    return practiceTabHref(normalized as PracticeTab)
  }
  return "/settings?tab=practice"
}
