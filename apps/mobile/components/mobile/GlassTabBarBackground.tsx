import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { radii } from "@/lib/theme";

/**
 * Floating dock glass — iOS-style liquid / frosted material.
 * Used as Expo Router `tabBarBackground`.
 */
export function GlassTabBarBackground() {
  return (
    <View style={styles.shell} pointerEvents="none">
      <View style={styles.clip}>
        <BlurView
          intensity={Platform.OS === "ios" ? 70 : 92}
          tint={
            Platform.OS === "ios"
              ? "systemUltraThinMaterialLight"
              : "light"
          }
          blurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        {/* Translucent glass wash */}
        <View style={styles.wash} />
        {/* Specular top edge (liquid glass rim) */}
        <View style={styles.specular} />
        {/* Soft inner highlight */}
        <View style={styles.innerGlow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.xxl,
    // Shadow lives outside the clipped blur so it isn’t cut off.
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 36,
    elevation: 16,
  },
  clip: {
    flex: 1,
    borderRadius: radii.xxl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    borderColor: "rgba(255, 255, 255, 0.72)",
    backgroundColor:
      Platform.OS === "ios"
        ? "rgba(255, 255, 255, 0.18)"
        : "rgba(255, 255, 255, 0.82)",
  },
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  specular: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
  },
  innerGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
});
