import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon, type SvgIconName } from "@/components/icons/SvgIcon";
import { dockLayout, dockLift } from "@/lib/dockLayout";
import { colors } from "@/lib/theme";

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

/** Minimal props from React Navigation bottom tab bar. */
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

const TAB_ICONS: Record<
  string,
  { label: string; active: SvgIconName; idle: SvgIconName }
> = {
  home: { label: "Home", active: "home", idle: "homeOutline" },
  doctors: { label: "Clinics", active: "medkit", idle: "medkitOutline" },
  appointments: {
    label: "Bookings",
    active: "calendar",
    idle: "calendarOutline",
  },
  profile: { label: "Profile", active: "person", idle: "personOutline" },
};

/** Even px sizes stay sharp on @2x/@3x — never scale icon glyphs. */
const ICON_SIZE = 22;

/** Detail screens with their own bottom action bar. */
const HIDE_ON = new Set(["doctor/[slug]"]);

function DockItem({
  label,
  a11yLabel,
  iconActive,
  iconIdle,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  a11yLabel: string;
  iconActive: SvgIconName;
  iconIdle: SvgIconName;
  focused: boolean;
  onPress: (e: GestureResponderEvent) => void;
  onLongPress: (e: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      hitSlop={4}
    >
      <View style={styles.iconSlot} collapsable={false}>
        <SvgIcon
          name={focused ? iconActive : iconIdle}
          size={ICON_SIZE}
          color={focused ? colors.brand : colors.inkFaint}
        />
      </View>
      <Text
        style={[styles.label, focused && styles.labelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Floating labelled tab bar — teal active tab, matches the patient web portal nav. */
export function FloatingDock({
  state,
  descriptors,
  navigation,
}: FloatingDockProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index];
  if (current && HIDE_ON.has(current.name)) return null;

  const visible = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options;
    return options?.href !== null;
  });

  const focusedVisibleIndex = visible.findIndex(
    (route) => current?.key === route.key,
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: dockLift(insets.bottom) }]}
    >
      <View style={styles.dockShell}>
        <View style={styles.dockClip}>
          <BlurView
            intensity={Platform.OS === "ios" ? 60 : 80}
            tint={Platform.OS === "ios" ? "systemThinMaterialLight" : "light"}
            blurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.wash} pointerEvents="none" />

          <View style={styles.row}>
            {visible.map((route, index) => {
              const meta = TAB_ICONS[route.name];
              if (!meta) return null;

              const focused = focusedVisibleIndex === index;
              const options = descriptors[route.key]?.options;
              const label =
                typeof options?.tabBarLabel === "string"
                  ? options.tabBarLabel
                  : meta.label;
              const a11yLabel =
                typeof options?.title === "string" ? options.title : label;

              return (
                <DockItem
                  key={route.key}
                  label={label}
                  a11yLabel={a11yLabel}
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
                      navigation.navigate(route.name, route.params);
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
    paddingHorizontal: dockLayout.horizontal,
  },
  dockShell: {
    borderRadius: dockLayout.radius,
    shadowColor: "#0B1220",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  dockClip: {
    height: dockLayout.height,
    borderRadius: dockLayout.radius,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.9)",
    backgroundColor:
      Platform.OS === "ios"
        ? "rgba(255, 255, 255, 0.7)"
        : "rgba(255, 255, 255, 0.97)",
    justifyContent: "center",
  },
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  itemPressed: {
    opacity: 0.6,
  },
  iconSlot: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: colors.inkFaint,
  },
  labelActive: {
    color: colors.brand,
  },
});
