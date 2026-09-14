/** UI text size preference stored per user. */

export const TEXT_SIZES = [
  { id: "small", label: "Small", scale: "90%" },
  { id: "medium", label: "Medium", scale: "100%" },
  { id: "large", label: "Large", scale: "115%" },
] as const

export type TextSize = (typeof TEXT_SIZES)[number]["id"]

export const DEFAULT_TEXT_SIZE: TextSize = "medium"

export function isTextSize(value: unknown): value is TextSize {
  return (
    value === "small" || value === "medium" || value === "large"
  )
}

export function applyTextSize(size: TextSize) {
  if (typeof document === "undefined") return
  const entry = TEXT_SIZES.find((t) => t.id === size)
  document.documentElement.style.fontSize = entry?.scale ?? "100%"
  document.documentElement.dataset.textSize = size
}
