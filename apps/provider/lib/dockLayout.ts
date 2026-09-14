import { Platform } from "react-native";
import { radii } from "@/lib/theme";

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
