import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CareThemeProvider } from "@/lib/careTheme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CareThemeProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </CareThemeProvider>
    </SafeAreaProvider>
  );
}
