import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  colors,
  dash,
  type DashTone,
  radii,
  shadows,
  space,
} from "@/lib/theme";

/**
 * Soft ambient wash — View layers only.
 * Avoids expo-linear-gradient (requires native rebuild).
 */
export function PremiumAtmosphere() {
  return (
    <View style={styles.atmosphere} pointerEvents="none">
      <View style={styles.base} />
      <View style={styles.washTop} />
      <View style={styles.orbBlue} />
      <View style={styles.orbTeal} />
      <View style={styles.orbAmber} />
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

/** Colored dashboard metric tile (patients / queue / finished …). */
export function DashMetric({
  label,
  value,
  hint,
  tone = "blue",
  onPress,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: DashTone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = dash[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.metric,
        {
          backgroundColor: t.bg,
          borderColor: t.border,
        },
        pressed && onPress ? styles.metricPressed : null,
        style,
      ]}
    >
      <View style={[styles.metricDot, { backgroundColor: t.solid }]} />
      <Text style={[styles.metricLabel, { color: t.ink }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: t.ink }]}>{value}</Text>
      {hint ? (
        <Text style={[styles.metricHint, { color: t.ink }]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

/** Quick-link row with a colored leading accent. */
export function DashLinkCard({
  title,
  body,
  tone = "blue",
  onPress,
}: {
  title: string;
  body: string;
  tone?: DashTone;
  onPress: () => void;
}) {
  const t = dash[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkCard,
        pressed ? styles.linkCardPressed : null,
      ]}
    >
      <View style={[styles.linkAccent, { backgroundColor: t.solid }]} />
      <View style={styles.linkBody}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkHint}>{body}</Text>
      </View>
      <View style={[styles.linkChip, { backgroundColor: t.soft }]}>
        <Text style={[styles.linkChipText, { color: t.ink }]}>Open</Text>
      </View>
    </Pressable>
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
    height: "48%",
    backgroundColor: "#F7F9FC",
    opacity: 0.95,
  },
  orbBlue: {
    position: "absolute",
    top: -100,
    right: -50,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(37, 99, 235, 0.10)",
  },
  orbTeal: {
    position: "absolute",
    top: 140,
    left: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(13, 148, 136, 0.08)",
  },
  orbAmber: {
    position: "absolute",
    bottom: 140,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(217, 119, 6, 0.06)",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    ...shadows.soft,
  },
  cardNavy: {
    backgroundColor: colors.navy,
    borderColor: "transparent",
  },
  metric: {
    flex: 1,
    borderRadius: radii.xl,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 108,
    overflow: "hidden",
    ...shadows.soft,
  },
  metricPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  metricDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    opacity: 0.85,
  },
  metricValue: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  metricHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    marginBottom: space.sm,
    overflow: "hidden",
    ...shadows.soft,
  },
  linkCardPressed: { opacity: 0.92 },
  linkAccent: {
    width: 5,
    alignSelf: "stretch",
  },
  linkBody: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  linkHint: {
    marginTop: space.xs,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  linkChip: {
    marginRight: space.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  linkChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
