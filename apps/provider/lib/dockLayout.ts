import { Platform } from "react-native";
import { space } from "@/lib/theme";

/**
 * Floating bottom dock metrics — keep scroll padding and Mira FAB in sync.
 */
export const dockLayout = {
  bottom: 10,
  /** Icon + label row. */
  height: 72,
  horizontal: 14,
  radius: 28,
  contentGap: 14,
} as const;

/** Space reserved under scroll content for the Mira FAB (above dock). */
export const fabSize = 56;

/** Padding so lists clear the dock + home indicator (+ optional Mira FAB). */
export function contentBottomPad(
  insetsBottom = 0,
  opts?: { fab?: boolean },
) {
  const dockReserve =
    dockLayout.bottom +
    dockLayout.height +
    dockLayout.contentGap +
    Math.max(insetsBottom - 4, 0);
  const base = Math.max(dockReserve, space.xl + insetsBottom);
  return opts?.fab ? base + fabSize + space.sm : base;
}

/** Mira FAB sits just above the dock. */
export const dockClearance = dockLayout.height + dockLayout.contentGap;
