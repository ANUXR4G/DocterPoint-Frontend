import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

/** Patients list + detail share one tab stack so Back returns to the roster. */
export default function PatientsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[key]" />
    </Stack>
  );
}
