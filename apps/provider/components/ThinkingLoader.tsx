import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, space, type } from "@/lib/theme";

type ThinkingLoaderProps = {
  size?: 20 | 64;
  label?: string;
  fullPage?: boolean;
  theme?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
  /** Kept for API parity with patient app. */
  state?: string;
  cycleMs?: number;
};

/**
 * Loading indicator — ActivityIndicator fallback (no native orb package).
 * Matches patient ThinkingLoader props so screens can share call sites.
 */
export function ThinkingLoader({
  size = 64,
  label = "Loading",
  fullPage = false,
  theme = "light",
  style,
}: ThinkingLoaderProps) {
  const color = theme === "dark" ? colors.white : colors.navy;
  const spinner = (
    <ActivityIndicator
      size={size >= 48 ? "large" : "small"}
      color={color}
      accessibilityLabel={label}
    />
  );

  if (!fullPage) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        style={[styles.inline, style]}
      >
        {spinner}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.full, style]}
    >
      {spinner}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    alignItems: "center",
    justifyContent: "center",
  },
  full: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    gap: space.md,
  },
  label: {
    ...type.label,
    color: colors.inkSoft,
  },
});
