import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ThinkingOrb, type OrbState, type OrbTheme } from "expo-thinking-orbs";
import { colors, space, type } from "@/lib/theme";

/** Same loader states as the web dashboard ThinkingLoader. */
const LOADER_ORB_STATES: { state: OrbState; label: string }[] = [
  { state: "working", label: "Working" },
  { state: "searching", label: "Searching" },
  { state: "solving", label: "Solving" },
  { state: "listening", label: "Listening" },
  { state: "composing", label: "Composing" },
  { state: "shaping", label: "Shaping" },
];

type ThinkingLoaderProps = {
  /** Pin a single state; omit on fullPage to cycle like the dashboard. */
  state?: OrbState;
  size?: 20 | 64;
  label?: string;
  /** Full-screen centered loader (route / screen loading). */
  fullPage?: boolean;
  cycleMs?: number;
  /** `light` = dark dots on light bg; `dark` = light dots on dark bg. */
  theme?: OrbTheme;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mobile loading indicator — same thinking-orbs language as the web dashboard.
 */
export function ThinkingLoader({
  state,
  size = 64,
  label = "Loading",
  fullPage = false,
  cycleMs = 1400,
  theme = "light",
  style,
}: ThinkingLoaderProps) {
  const [cycleIndex, setCycleIndex] = useState(0);
  const shouldCycle = fullPage && state == null;

  useEffect(() => {
    if (!shouldCycle) return;
    const id = setInterval(() => {
      setCycleIndex((i) => (i + 1) % LOADER_ORB_STATES.length);
    }, cycleMs);
    return () => clearInterval(id);
  }, [shouldCycle, cycleMs]);

  const active = shouldCycle
    ? LOADER_ORB_STATES[cycleIndex]!
    : (LOADER_ORB_STATES.find((s) => s.state === state) ?? LOADER_ORB_STATES[0]!);

  const displayLabel = label;

  const orb = (
    <ThinkingOrb
      state={active.state}
      size={size}
      theme={theme}
      accessibilityLabel={displayLabel}
    />
  );

  if (!fullPage) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={displayLabel}
        style={[styles.inline, style]}
      >
        {orb}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={displayLabel}
      style={[styles.fullPage, style]}
    >
      {orb}
      <Text style={styles.label}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    justifyContent: "center",
  },
  fullPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    gap: space.md,
  },
  label: {
    ...type.caption,
    minHeight: 20,
    color: colors.inkSoft,
  },
});
