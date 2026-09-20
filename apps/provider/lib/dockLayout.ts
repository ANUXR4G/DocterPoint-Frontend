import { Platform } from "react-native";
import { radii, space } from "@/lib/theme";

/**
 * Compact icon-only floating dock metrics.
 * Keep Mira FAB clearance in sync with the custom tab bar.
 */
export const dockLayout = {
  bottom: Platform.OS === "ios" ? 18 : 12,
  height: 58,
  horizontal: 20,
  radius: radii.xxl,
  contentGap: 8,
} as const;

/** Padding from the screen bottom so content clears the floating dock. */
export const dockClearance =
  dockLayout.bottom + dockLayout.height + dockLayout.contentGap;

/** Mira FAB size — keep in sync with GlucoBotFab. */
export const fabSize = 56;

/**
 * Scroll content bottom pad so lists clear the floating dock
 * (and optionally the Mira FAB that sits above it).
 */
export function contentBottomPad(
  insetsBottom = 0,
  opts?: { fab?: boolean },
) {
  const base = dockClearance + Math.max(insetsBottom, 0) + space.xl;
  return opts?.fab ? base + fabSize + space.sm : base;
}
