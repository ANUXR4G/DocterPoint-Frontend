import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MiraChat } from "@/components/MiraChat";
import { dockClearance } from "@/lib/dockLayout";
import { colors, space } from "@/lib/theme";

const HIDDEN_ON = [
  "/record",
  "/(app)/record",
];

/**
 * Mira floating sheet — pins sheet bottom to the keyboard top so the composer
 * stays visible. Avoids KeyboardAvoidingView inside Modals (unreliable on iOS).
 */
export function GlucoBotFab() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!open) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const { height, screenY } = e.endCoordinates ?? {};
      // Prefer screen math so Dynamic Island / status bar quirks don't drift.
      const fromScreen =
        typeof screenY === "number" && screenY > 0
          ? Math.max(0, windowHeight - screenY)
          : 0;
      const h = Math.round(fromScreen || height || 0);
      setKeyboardHeight(Math.max(0, h));
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [open, windowHeight]);

  const sheetLayout = useMemo(() => {
    const keyboardOpen = keyboardHeight > 40;
    const topGap = Math.max(insets.top, 12) + (keyboardOpen ? 6 : 20);
    const bottom = keyboardOpen ? keyboardHeight : 0;
    const available = Math.max(260, windowHeight - topGap - bottom);
    const restingHeight = Math.min(windowHeight * 0.78, available);

    return {
      keyboardOpen,
      bottom,
      height: keyboardOpen ? available : restingHeight,
    };
  }, [keyboardHeight, windowHeight, insets.top]);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.endsWith("/queries"))) {
    return null;
  }

  function close() {
    Keyboard.dismiss();
    setOpen(false);
  }

  return (
    <>
      {/* Hide FAB while the sheet is open so it cannot cover the composer. */}
      {!open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open help chat"
          onPress={() => setOpen(true)}
          style={[
            styles.fab,
            {
              bottom: dockClearance + 8,
              right: Math.max(insets.right, 22),
            },
          ]}
        >
          <Ionicons name="chatbubbles" size={24} color={colors.white} />
        </Pressable>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.backdropTap}
            onPress={close}
            accessibilityLabel="Dismiss help chat"
          />

          <View
            style={[
              styles.sheet,
              {
                bottom: sheetLayout.bottom,
                height: sheetLayout.height,
                paddingBottom: sheetLayout.keyboardOpen
                  ? space.sm
                  : Math.max(insets.bottom, space.md),
              },
            ]}
          >
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={styles.sheetIcon}>
                  <Ionicons
                    name="chatbubbles"
                    size={18}
                    color={colors.brand}
                  />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Mira</Text>
                  <Text style={styles.sheetSubtitle}>GlucoGuide help</Text>
                </View>
              </View>
              <Pressable
                onPress={close}
                style={styles.closeButton}
                accessibilityLabel="Close help chat"
              >
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>

            <MiraChat compact style={styles.chat} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadowDeep,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    zIndex: 50,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 18, 32, 0.45)",
  },
  backdropTap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.paperRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    zIndex: 2,
    elevation: 8,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  },
  chat: {
    flex: 1,
    minHeight: 0,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
});
