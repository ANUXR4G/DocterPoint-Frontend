import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon, type SvgIconName } from "@/components/icons/SvgIcon";
import { dockLayout } from "@/lib/dockLayout";
import { usePractice } from "@/lib/practiceContext";
import {
  buildSidebarNav,
  sidebarItemActive,
  type SidebarNavItem,
} from "@/lib/sidebarNav";
import { colors, shadows } from "@/lib/theme";

const ICON_SIZE = 22;
const ITEM_W = 64;

/** Prefer outline when idle if the glyph set has one. */
function idleIcon(name: SvgIconName): SvgIconName {
  const outline = `${name}Outline` as SvgIconName;
  const known: SvgIconName[] = [
    "homeOutline",
    "listOutline",
    "calendarOutline",
    "calendarNumberOutline",
    "peopleOutline",
    "chartOutline",
    "moreOutline",
    "chatOutline",
  ];
  return known.includes(outline) ? outline : name;
}

function DockItem({
  item,
  focused,
  onPress,
}: {
  item: SidebarNavItem;
  focused: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={item.label}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.itemHit, pressed && styles.itemPressed]}
      hitSlop={2}
    >
      <View style={[styles.bubble, focused && styles.bubbleFocused]}>
        <SvgIcon
          name={focused ? item.icon : idleIcon(item.icon)}
          size={ICON_SIZE}
          color={focused ? colors.brand : colors.inkSoft}
        />
        {item.badge && item.badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {item.badge > 99 ? "99+" : String(item.badge)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.label, focused && styles.labelFocused]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * Scrollable bottom dock with every portal destination (former sidebar list).
 */
export function FloatingDock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { membership } = usePractice();
  const items = useMemo(() => buildSidebarNav(membership), [membership]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: dockLayout.bottom + Math.max(insets.bottom - 4, 0) },
      ]}
    >
      <View style={[styles.dockShell, shadows.dock]}>
        <View style={styles.dockClip}>
          <BlurView
            intensity={Platform.OS === "ios" ? 55 : 80}
            tint={Platform.OS === "ios" ? "systemThinMaterialLight" : "light"}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.wash} pointerEvents="none" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.row}
          >
            {items.map((item) => {
              const focused = sidebarItemActive(item, pathname);
              return (
                <DockItem
                  key={item.key}
                  item={item}
                  focused={focused}
                  onPress={() => {
                    if (focused) return;
                    // Always stay inside the Expo app — never Linking / WhatsApp / web.
                    router.navigate(item.href as Href);
                  }}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: dockLayout.horizontal,
    zIndex: 40,
  },
  dockShell: {
    borderRadius: dockLayout.radius,
    maxWidth: "100%",
    width: "100%",
  },
  dockClip: {
    height: dockLayout.height,
    borderRadius: dockLayout.radius,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor:
      Platform.OS === "ios"
        ? "rgba(255, 255, 255, 0.55)"
        : "rgba(255, 255, 255, 0.94)",
    justifyContent: "center",
  },
  wash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 2,
    minHeight: dockLayout.height,
  },
  itemHit: {
    width: ITEM_W,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  itemPressed: { opacity: 0.72 },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
  },
  bubbleFocused: {
    backgroundColor: colors.brandLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(58, 141, 154, 0.28)",
  },
  label: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: colors.inkFaint,
    textAlign: "center",
    maxWidth: ITEM_W - 4,
  },
  labelFocused: {
    color: colors.brand,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
});
