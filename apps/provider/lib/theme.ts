/** Provider app — same premium healthcare system language as the patient app. */
export const colors = {
  ink: "#090E17",
  inkSoft: "#5C6578",
  inkFaint: "#98A1B2",
  brand: "#2563EB",
  brandHover: "#1D4ED8",
  brandLight: "#EFF4FF",
  brandMist: "#F5F8FF",
  brandDeep: "#111827",
  sky50: "#F8FAFC",
  sky100: "#EEF1F6",
  accent: "#0F766E",
  paper: "#F0F2F5",
  paperRaised: "#FFFFFF",
  line: "rgba(9, 14, 23, 0.06)",
  lineStrong: "rgba(9, 14, 23, 0.08)",
  danger: "#DC2626",
  success: "#047857",
  ok: "#047857",
  rose: "#E11D48",
  roseLight: "#FFF1F2",
  emeraldLight: "#ECFDF5",
  amberLight: "#FFFBEB",
  white: "#FFFFFF",
  navy: "#111827",
  navySoft: "#1F2937",
  shadow: "rgba(15, 23, 42, 0.06)",
  shadowDeep: "rgba(15, 23, 42, 0.10)",
} as const;

/**
 * Soft tinted surfaces for dashboard metrics, queue chips, and quick links.
 * Healthcare palette: blue / teal / amber / emerald / sky / coral — not purple.
 */
export const dash = {
  blue: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    ink: "#1D4ED8",
    soft: "#DBEAFE",
    solid: "#2563EB",
  },
  teal: {
    bg: "#F0FDFA",
    border: "#99F6E4",
    ink: "#0F766E",
    soft: "#CCFBF1",
    solid: "#0D9488",
  },
  amber: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    ink: "#B45309",
    soft: "#FEF3C7",
    solid: "#D97706",
  },
  emerald: {
    bg: "#ECFDF5",
    border: "#A7F3D0",
    ink: "#047857",
    soft: "#D1FAE5",
    solid: "#059669",
  },
  sky: {
    bg: "#F0F9FF",
    border: "#BAE6FD",
    ink: "#0369A1",
    soft: "#E0F2FE",
    solid: "#0284C7",
  },
  coral: {
    bg: "#FFF1F2",
    border: "#FECDD3",
    ink: "#BE123C",
    soft: "#FFE4E6",
    solid: "#E11D48",
  },
} as const;

export type DashTone = keyof typeof dash;

export const dashOrder: DashTone[] = [
  "blue",
  "teal",
  "amber",
  "emerald",
  "sky",
  "coral",
];

export const radii = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 26,
  xxl: 32,
  pill: 999,
  full: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const type = {
  hero: {
    fontSize: 34,
    fontWeight: "500" as const,
    letterSpacing: -1.1,
    lineHeight: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "600" as const,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 23,
    letterSpacing: -0.15,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    fontWeight: "500" as const,
    letterSpacing: -0.1,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    letterSpacing: 0,
  },
  overline: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
  },
};

export const shadows = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  soft: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  float: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  dock: {
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 12,
  },
} as const;
