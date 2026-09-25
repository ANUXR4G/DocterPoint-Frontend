import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "@/lib/motion";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  title?: string
  showProfile?: boolean
  liveConnected?: boolean
}

export function MobileHomeHeader({
  title,
  showProfile = true,
  liveConnected,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>G</Text>
          </View>
          <View>
            <Text style={styles.brand}>{title ?? "GlucoGuide"}</Text>
            <Text style={styles.brandSub}>
              {liveConnected === undefined
                ? "Premium care"
                : liveConnected
                  ? "Live updates on"
                  : "Connecting live…"}
            </Text>
          </View>
        </View>
        {showProfile ? (
          <Link href="/(app)/profile" asChild>
            <PressableScale style={styles.avatar} accessibilityLabel="Profile">
              <Ionicons name="person-outline" size={18} color={colors.ink} />
            </PressableScale>
          </Link>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: -0.4,
  },
  brand: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.35,
  },
  brandSub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "400",
    color: colors.inkFaint,
    letterSpacing: 0.2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
});
