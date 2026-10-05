/** Patient app — soft teal healthcare system. */
export const colors = {
  ink: "#0F1B24",
  inkSoft: "#5B6B76",
  inkFaint: "#97A5AE",
  brand: "#3A8D9A",
  brandHover: "#2E7583",
  brandLight: "#E4F1F3",
  brandMist: "#F0F7F8",
  sky50: "#F8FAFB",
  sky100: "#EEF3F5",
  accent: "#0F766E",
  paper: "#F3F6F7",
  paperRaised: "#FFFFFF",
  line: "rgba(9, 14, 23, 0.06)",
  lineStrong: "#E2E5EB",
  danger: "#DC2626",
  success: "#047857",
  rose: "#E11D48",
  roseLight: "#FFF1F2",
  emeraldLight: "#ECFDF5",
  amberLight: "#FFFBEB",
  purple: "#7C3AED",
  purpleLight: "#F3E8FF",
  white: "#FFFFFF",
  navy: "#111827",
  navySoft: "#1F2937",
  shadow: "rgba(9, 14, 23, 0.05)",
  shadowDeep: "rgba(9, 14, 23, 0.12)",
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 999,
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
    shadowColor: colors.shadowDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 4,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 2,
  },
  brand: {
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 6,
  },
  float: {
    shadowColor: colors.shadowDeep,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;
