export const THEME_COLORS = [
  { id: "violet", label: "Violet", primary: "#b794f6", hover: "#9b7fe8" },
  { id: "blue", label: "Blue", primary: "#7cb8ff", hover: "#5aa3f0" },
  { id: "cyan", label: "Cyan", primary: "#7dd3fc", hover: "#38bdf8" },
  { id: "green", label: "Green", primary: "#7bc4a3", hover: "#5aad88" },
  { id: "orange", label: "Orange", primary: "#ff9a76", hover: "#f07f58" },
  { id: "rose", label: "Rose", primary: "#f7a8c4", hover: "#f08a8a" },
  { id: "yellow", label: "Yellow", primary: "#f2c94c", hover: "#d4a82a" },
  { id: "zinc", label: "Zinc", primary: "#8a8580", hover: "#6b6560" },
] as const

export type ThemeColor = (typeof THEME_COLORS)[number]["id"]

export const DEFAULT_THEME_COLOR: ThemeColor = "violet"

export function isThemeColor(value: string | null | undefined): value is ThemeColor {
  return THEME_COLORS.some((c) => c.id === value)
}

export function getThemeColor(id: ThemeColor) {
  return THEME_COLORS.find((c) => c.id === id) ?? THEME_COLORS[0]
}

/** Apply accent CSS vars + data attribute on <html> */
export function applyThemeColor(id: ThemeColor, root: HTMLElement = document.documentElement) {
  const color = getThemeColor(id)
  root.setAttribute("data-theme-color", color.id)
  root.style.setProperty("--theme-primary", color.primary)
  root.style.setProperty("--theme-primary-hover", color.hover)
  root.style.setProperty("--theme-primary-foreground", "#ffffff")
  root.style.setProperty("--primary-blue", color.primary)
  root.style.setProperty("--color-iris-accent", color.primary)
  root.style.setProperty("--color-clinical-cyan", color.primary)
  root.style.setProperty("--color-cyan-soft", color.primary)
  root.style.setProperty("--dashboard-accent", color.primary)
}
