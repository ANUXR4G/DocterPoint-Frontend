import { Platform } from "react-native";
import { radii, space } from "@/lib/theme";

/**
 * Floating labelled tab bar metrics.
 * Keep MiraChat / FAB clearance in sync with the custom tab bar.
 */
export const dockLayout = {
  /** Gap above the home indicator / Android system nav. */
  bottom: Platform.OS === "ios" ? 10 : 8,
  /** Icon + label row inside the capsule. */
  height: 64,
  horizontal: 18,
  radius: radii.xxl,
  contentGap: 8,
} as const;

/** Lift the floating dock above the system gesture / nav bar. */
export function dockLift(insetsBottom = 0) {
  return dockLayout.bottom + Math.max(insetsBottom, 0);
}

/**
 * Padding from the screen bottom so scroll content clears the floating dock
 * (and the system nav bar the dock sits above).
 */
export function contentBottomPad(insetsBottom = 0) {
  return (
    dockLift(insetsBottom) +
    dockLayout.height +
    dockLayout.contentGap +
    space.md
  );
}

/** @deprecated Prefer contentBottomPad(insets.bottom) — ignores safe area. */
export const dockClearance =
  dockLayout.bottom + dockLayout.height + dockLayout.contentGap;
