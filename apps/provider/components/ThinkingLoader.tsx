import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ThinkingOrb, type OrbState, type OrbTheme } from "expo-thinking-orbs";
import { colors, space, type } from "@/lib/theme";

/** Doctor-app loader copy — clinic / queue focused (not generic “Searching”). */
const LOADER_ORB_STATES: { state: OrbState; label: string }[] = [
  { state: "working", label: "Opening clinic desk…" },
  { state: "searching", label: "Loading today’s visits…" },
  { state: "solving", label: "Syncing queue…" },
  { state: "listening", label: "Checking appointments…" },
  { state: "composing", label: "Preparing patient list…" },
  { state: "shaping", label: "Almost ready…" },
];

type ThinkingLoaderProps = {
  /** Pin a single state; omit on fullPage to cycle clinic messages. */
  state?: OrbState;
  size?: 20 | 64;
  label?: string;
  fullPage?: boolean;
  cycleMs?: number;
  theme?: OrbTheme;
  style?: StyleProp<ViewStyle>;
};

/**
 * Same thinking-orbs loader as the patient app; bottom text is GlucoGuide Doctor.
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
  const shouldCycle = fullPage && state == null && label === "Loading";

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

  const displayLabel = shouldCycle ? active.label : label;

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
    textAlign: "center",
    paddingHorizontal: space.xl,
  },
});
