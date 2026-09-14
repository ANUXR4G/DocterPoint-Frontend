import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { BlurView } from "expo-blur";
import { dockLayout } from "@/lib/dockLayout";
import { colors, shadows } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

export type FloatingDockProps = {
  state: {
    index: number;
    routes: TabRoute[];
  };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarLabel?: string | ((props: unknown) => ReactNode);
        href?: string | null;
        tabBarAccessibilityLabel?: string;
      };
    }
  >;
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

/** Only these routes get a dock icon, in this order. */
const DOCK_ORDER = [
  "queue",
  "calendar",
  "patients",
  "analytics",
  "profile",
] as const;

const TAB_ICONS: Record<
  string,
  { label: string; active: IconName; idle: IconName }
> = {
  queue: { label: "Today", active: "list", idle: "list-outline" },
  calendar: {
    label: "Calendar",
    active: "calendar",
    idle: "calendar-outline",
  },
  patients: { label: "Patients", active: "people", idle: "people-outline" },
  analytics: {
    label: "Analytics",
    active: "stats-chart",
    idle: "stats-chart-outline",
  },
  profile: {
    label: "More",
    active: "ellipsis-horizontal",
    idle: "ellipsis-horizontal-outline",
  },
};

const ICON_SIZE = 24;
const BUBBLE = 44;

function DockItem({
  label,
  iconActive,
  iconIdle,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  iconActive: IconName;
  iconIdle: IconName;
  focused: boolean;
  onPress: (e: GestureResponderEvent) => void;
  onLongPress: (e: GestureResponderEvent) => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={styles.itemHit}
      hitSlop={4}
    >
      <View
        style={[
          styles.bubble,
          focused && styles.bubbleFocused,
          pressed && styles.bubblePressed,
        ]}
      >
        <View style={styles.iconSlot} collapsable={false}>
          <Ionicons
            name={focused ? iconActive : iconIdle}
            size={ICON_SIZE}
            color={focused ? colors.navy : colors.inkSoft}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function FloatingDock({
  state,
  descriptors,
  navigation,
}: FloatingDockProps) {
  const byName = new Map(state.routes.map((r) => [r.name, r]));
  const visible = DOCK_ORDER.map((name) => byName.get(name)).filter(
    (r): r is TabRoute => !!r,
  );
  const focusedKey = state.routes[state.index]?.key;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.dockShell, shadows.dock]}>
        <View style={styles.dockClip}>
          <BlurView
            intensity={Platform.OS === "ios" ? 55 : 80}
            tint={Platform.OS === "ios" ? "systemThinMaterialLight" : "light"}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.wash} pointerEvents="none" />
          <View style={styles.row}>
            {visible.map((route) => {
              const meta = TAB_ICONS[route.name]!;
              const focused = route.key === focusedKey;
              const options = descriptors[route.key]?.options;
              const label =
                typeof options?.title === "string" ? options.title : meta.label;

              return (
                <DockItem
                  key={route.key}
                  label={label}
                  iconActive={meta.active}
                  iconIdle={meta.idle}
                  focused={focused}
                  onPress={() => {
                    const event = navigation.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  }}
                  onLongPress={() => {
                    navigation.emit({
                      type: "tabLongPress",
                      target: route.key,
                    });
                  }}
                />
              );
            })}
          </View>
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
    bottom: dockLayout.bottom,
    alignItems: "center",
    paddingHorizontal: dockLayout.horizontal,
  },
  dockShell: {
    borderRadius: dockLayout.radius,
    maxWidth: "100%",
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
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    zIndex: 1,
  },
  itemHit: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
  },
  bubbleFocused: {
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17, 24, 39, 0.08)",
  },
  bubblePressed: {
    opacity: 0.72,
  },
  iconSlot: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
