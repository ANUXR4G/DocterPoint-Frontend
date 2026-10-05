import { Platform } from "react-native";
import { space } from "@/lib/theme";

/**
 * Content insets after the bottom dock was replaced by a sidebar menu.
 * Keep Mira FAB clearance in sync with GlucoBotFab.
 */
export const dockLayout = {
  /** No floating dock — keep keys for older call sites. */
  bottom: 0,
  height: 0,
  horizontal: 20,
  radius: 0,
  contentGap: 0,
} as const;

/** Space reserved under scroll content for the Mira FAB. */
export const fabSize = 56;

/** Padding so lists clear the home indicator + optional Mira FAB. */
export function contentBottomPad(
  insetsBottom = 0,
  opts?: { fab?: boolean },
) {
  const base =
    Math.max(insetsBottom, Platform.OS === "ios" ? 8 : 4) + space.xl;
  return opts?.fab ? base + fabSize + space.sm : base;
}

/** Former dock clearance — now just a small bottom gap for the FAB. */
export const dockClearance = space.md;
