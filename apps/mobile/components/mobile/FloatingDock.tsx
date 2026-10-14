import { useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CareGlyph,
  RainbowSparkle,
  type CareGlyphName,
} from "@/components/mobile/careArt";
import { useCareTheme } from "@/lib/careTheme";

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

const TAB_ICONS: Record<string, { label: string; icon: CareGlyphName }> = {
  home: { label: "Home", icon: "home" },
  doctors: { label: "Clinics", icon: "people" },
  appointments: { label: "Visits", icon: "calendar" },
  profile: { label: "Profile", icon: "person" },
};

const MORE: { label: string; route: string; icon: CareGlyphName }[] = [
  { label: "Settings", route: "settings", icon: "settings" },
  { label: "Calendar", route: "record", icon: "calendar" },
  { label: "Help", route: "queries", icon: "note" },
];

const HIDE_ON = new Set(["doctor/[slug]"]);

/** Same care tab bar as the doctor app: Home, Clinics, sparkle, Visits, Profile. */
export function FloatingDock({ state, descriptors, navigation }: FloatingDockProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [more, setMore] = useState(false);
  const current = state.routes[state.index];
  if (current && HIDE_ON.has(current.name)) return null;

  const visible = state.routes.filter(
    (route) => descriptors[route.key]?.options?.href !== null && TAB_ICONS[route.name],
  );
  const left = visible.filter((route) => route.name === "home" || route.name === "doctors");
  const right = visible.filter(
    (route) => route.name === "appointments" || route.name === "profile",
  );

  function open(route: TabRoute) {
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (current?.key !== route.key && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  }

  function item(route: TabRoute) {
    const meta = TAB_ICONS[route.name];
    const focused = current?.key === route.key;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => open(route)}
        style={[styles.item, focused && { backgroundColor: theme.line }]}
      >
        <CareGlyph name={meta.icon} size={22} color={focused ? theme.ink : theme.muted} />
        <Text style={[styles.label, { color: focused ? theme.ink : theme.muted }]}>
          {meta.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <>
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={[styles.bar, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {left.map(item)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={() => setMore(true)}
            style={styles.spark}
          >
            <RainbowSparkle />
          </Pressable>
          {right.map(item)}
        </View>
      </View>
      <Modal visible={more} transparent animationType="fade" onRequestClose={() => setMore(false)}>
        <Pressable style={styles.scrim} onPress={() => setMore(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            {MORE.map((row) => (
              <Pressable
                key={row.route}
                onPress={() => {
                  setMore(false);
                  navigation.navigate(row.route);
                }}
                style={styles.moreRow}
              >
                <CareGlyph name={row.icon} size={20} color={theme.ink} />
                <Text style={[styles.moreLabel, { color: theme.ink }]}>{row.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
  },
  bar: {
    height: 68,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    shadowColor: "#1C1C1E",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 18,
    paddingVertical: 6,
    marginHorizontal: 2,
  },
  label: { fontSize: 10, fontWeight: "600" },
  spark: {
    width: 54,
    height: 54,
    marginTop: -22,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "flex-end",
    padding: 16,
  },
  sheet: { borderRadius: 20, padding: 8, marginBottom: 84 },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  moreLabel: { fontSize: 16, fontWeight: "600" },
});
