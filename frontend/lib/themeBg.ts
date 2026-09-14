/** Dashboard background: preset name or custom image URL. */

export const BG_PRESETS = [
  {
    id: "default",
    label: "Default glow",
    value: null as string | null,
    preview: "linear-gradient(135deg, #e0f2fe 0%, #f8fafc 50%, #fce7f3 100%)",
  },
  {
    id: "gradient-2",
    label: "Soft orbs",
    value: "preset:gradient-2",
    preview: "radial-gradient(circle at 80% 20%, #c4b5fd66, transparent 50%), #f8f8f8",
  },
  {
    id: "half-box",
    label: "Grid",
    value: "preset:half-box-pattern",
    preview:
      "linear-gradient(to right,#4f4f4f22 1px,transparent 1px),linear-gradient(to bottom,#4f4f4f22 1px,transparent 1px)",
  },
  {
    id: "dots",
    label: "Dots",
    value: "preset:dotted-patern",
    preview: "radial-gradient(#94a3b8 1px,transparent 1px)",
  },
  {
    id: "gradient-1",
    label: "Top wash",
    value: "preset:gradient-1",
    preview:
      "radial-gradient(100% 50% at 50% 0%, rgba(0,163,255,0.2) 0, transparent 60%), #ffffff",
  },
] as const

export type BgPresetId = (typeof BG_PRESETS)[number]["id"]

export function isPresetBg(value: string | null | undefined): boolean {
  return !!value && value.startsWith("preset:")
}

export function presetNameFromBg(
  value: string | null | undefined,
): string | null {
  if (!value?.startsWith("preset:")) return null
  return value.slice("preset:".length) || null
}

export function isCustomImageBg(value: string | null | undefined): boolean {
  if (!value || isPresetBg(value)) return false
  return /^https?:\/\//i.test(value) || value.startsWith("/")
}
