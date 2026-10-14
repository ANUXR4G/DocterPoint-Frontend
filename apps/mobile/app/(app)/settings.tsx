import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/mobile/ScreenHeader";
import { Screen } from "@/components/ui";
import { ThemeSwatches, useCareTheme } from "@/lib/careTheme";
import { contentBottomPad } from "@/lib/dockLayout";
import { space } from "@/lib/theme";

/** Colour theme for the patient app. The choice is stored on the phone. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <ScreenHeader title="Settings" back alignLeft />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPad(insets.bottom) },
        ]}
      >
        <Text style={[styles.lead, { color: theme.muted }]}>
          Pick the colour used on Home, Visits, and the tab bar.
        </Text>
        <ThemeSwatches />
        <Text style={[styles.note, { color: theme.muted }]}>
          Peach, Mint, Sky, Lavender, and Slate stay on this phone.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingTop: space.md },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  note: { fontSize: 13, lineHeight: 18 },
});
