import { Platform } from "react-native";
import { radii } from "@/lib/theme";

/**
 * Floating labelled tab bar metrics.
 * Keep MiraChat / FAB clearance in sync with the custom tab bar.
 */
export const dockLayout = {
  bottom: Platform.OS === "ios" ? 18 : 12,
  /** Icon + label row inside the capsule. */
  height: 64,
  horizontal: 18,
  radius: radii.xxl,
  contentGap: 8,
} as const;

/** Padding from the screen bottom so content clears the floating dock. */
export const dockClearance =
  dockLayout.bottom + dockLayout.height + dockLayout.contentGap;
