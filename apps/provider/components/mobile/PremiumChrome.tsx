import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, shadows, radii } from "@/lib/theme";

/**
 * Soft ambient wash — View layers only.
 * Avoids expo-linear-gradient (requires native rebuild).
 */
export function PremiumAtmosphere() {
  return (
    <View style={styles.atmosphere} pointerEvents="none">
      <View style={styles.base} />
      <View style={styles.washTop} />
      <View style={styles.orbTop} />
      <View style={styles.orbSide} />
    </View>
  );
}

/** Elevated white surface used across premium screens. */
export function PremiumCard({
  children,
  style,
  tone = "light",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "light" | "navy";
}) {
  return (
    <View
      style={[styles.card, tone === "navy" && styles.cardNavy, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  atmosphere: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  base: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paper,
  },
  washTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "#F8FAFC",
    opacity: 0.9,
  },
  orbTop: {
    position: "absolute",
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  orbSide: {
    position: "absolute",
    bottom: 180,
    left: -90,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(15, 118, 110, 0.06)",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
    ...shadows.soft,
  },
  cardNavy: {
    backgroundColor: colors.navy,
  },
});
