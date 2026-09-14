import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MiraChat } from "@/components/MiraChat";
import { dockClearance } from "@/lib/dockLayout";
import { colors, radii, shadows, space } from "@/lib/theme";

const HIDDEN_ON = ["/queries", "/(app)/queries"];

export function GlucoBotFab() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.endsWith("/queries"))) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? "Close help chat" : "Open help chat"}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.fab,
          shadows.soft,
          {
            bottom: dockClearance + 8,
            right: Math.max(insets.right, 16),
          },
        ]}
      >
        <Ionicons
          name={open ? "close" : "chatbubbles"}
          size={24}
          color={colors.white}
        />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.backdropTap}
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, space.md),
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Mira</Text>
                <Text style={styles.sheetSubtitle}>GlucoGuide help</Text>
              </View>
              <Pressable
                onPress={() => setOpen(false)}
                style={styles.closeButton}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.brand} />
              </Pressable>
            </View>
            <MiraChat compact />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    height: "72%",
    minHeight: 420,
    backgroundColor: colors.paperRaised,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  sheetSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandMist,
  },
});
