import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareGlyph, RainbowSparkle, type CareGlyphName } from "@/components/mobile/careArt";
import { SvgIcon, type SvgIconName } from "@/components/icons/SvgIcon";
import { useCareTheme } from "@/lib/careTheme";

const TABS: { label: string; href: string; match: string; icon: CareGlyphName }[] = [
  { label: "Home", href: "/(app)/dashboard", match: "/dashboard", icon: "home" },
  { label: "Patients", href: "/(app)/patients", match: "/patients", icon: "people" },
  { label: "Visits", href: "/(app)/appointments", match: "/appointments", icon: "calendar" },
  { label: "Profile", href: "/(app)/profile", match: "/profile", icon: "person" },
];

const MORE: { label: string; href: string; icon: SvgIconName }[] = [
  { label: "Queue", href: "/(app)/queue", icon: "list" },
  { label: "Calendar", href: "/(app)/calendar", icon: "calendar" },
  { label: "Notifications", href: "/(app)/notifications", icon: "bell" },
  { label: "Patient support", href: "/(app)/inbox", icon: "chat" },
  { label: "Settings", href: "/(app)/settings", icon: "settings" },
];

/** Home, Patients, sparkle, Visits, Profile — the care tab bar. */
export function CareTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [more, setMore] = useState(false);
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  function go(href: string) {
    setMore(false);
    router.navigate(href as Href);
  }

  function item(tab: (typeof TABS)[number]) {
    const focused = pathname.includes(tab.match);
    return (
      <Pressable
        key={tab.label}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tab.label}
        onPress={() => go(tab.href)}
        style={[styles.item, focused && { backgroundColor: theme.line }]}
      >
        <CareGlyph name={tab.icon} size={22} color={focused ? theme.ink : theme.muted} />
        <Text style={[styles.label, { color: focused ? theme.ink : theme.muted }]}>
          {tab.label}
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
              <Pressable key={row.href} onPress={() => go(row.href)} style={styles.moreRow}>
                <SvgIcon name={row.icon} size={20} color={theme.ink} />
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
  sheet: {
    borderRadius: 20,
    padding: 8,
    marginBottom: 84,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  moreLabel: { fontSize: 16, fontWeight: "600" },
});
