import { Tabs, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlucoBotFab } from "@/components/GlucoBotFab";
import {
  FloatingDock,
  type FloatingDockProps,
} from "@/components/mobile/FloatingDock";
import { Loading } from "@/components/ui";
import { clearSession } from "@/lib/api";
import {
  PracticeProvider,
  pickProviderId,
} from "@/lib/practiceContext";
import { PracticeLiveProvider } from "@/lib/PracticeLiveContext";
import { fetchMyPractices } from "@/lib/procto";
import type { PracticeMembership } from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";

export default function AppLayout() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<PracticeMembership[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    setLoadError("");
    const res = await fetchMyPractices();
    if (res.status !== "successful") {
      await clearSession();
      router.replace("/(auth)/login");
      return;
    }
    setMemberships((res.data as PracticeMembership[]) ?? []);
    setReady(true);
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const membership = memberships[practiceIndex] ?? memberships[0] ?? null;
  const providerId = pickProviderId(membership);

  const value = useMemo(
    () => ({
      memberships,
      membership,
      practiceId: membership?.practice.id ?? null,
      providerId,
      practiceIndex,
      setPracticeIndex,
      refresh,
    }),
    [memberships, membership, providerId, practiceIndex, refresh],
  );

  async function handleLogout() {
    await clearSession();
    router.replace("/(auth)/login");
  }

  if (!ready) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.paper }}
        edges={["top", "left", "right"]}
      >
        <Loading />
      </SafeAreaView>
    );
  }

  if (!membership) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          padding: space.xl,
          backgroundColor: colors.paper,
        }}
        edges={["top", "left", "right", "bottom"]}
      >
        <Text
          style={{
            color: colors.ink,
            fontSize: 20,
            fontWeight: "700",
            marginBottom: space.sm,
          }}
        >
          No clinic linked
        </Text>
        <Text
          style={{
            color: colors.inkSoft,
            marginBottom: space.xl,
            lineHeight: 20,
          }}
        >
          {loadError ||
            "This doctor account has no practice membership yet. Finish onboarding on the web clinic portal, then sign in again."}
        </Text>
        <Pressable
          onPress={() => void handleLogout()}
          style={{
            backgroundColor: colors.brand,
            borderRadius: radii.lg,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Sign out</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <PracticeProvider value={value}>
      <PracticeLiveProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.paper }}
        edges={["top", "left", "right"]}
      >
        <Tabs
          tabBar={(props) => (
            <FloatingDock {...(props as FloatingDockProps)} />
          )}
          screenOptions={{
            headerShown: false,
            headerStyle: {
              backgroundColor: colors.paper,
            },
            headerShadowVisible: false,
            headerTitleStyle: {
              color: colors.ink,
              fontWeight: "600",
              fontSize: 17,
              letterSpacing: -0.35,
            },
            headerTintColor: colors.navy,
            // Root SafeAreaView already clears the status bar
            headerStatusBarHeight: 0,
            tabBarActiveTintColor: colors.navy,
            tabBarInactiveTintColor: colors.inkSoft,
            tabBarStyle: {
              position: "absolute",
              backgroundColor: "transparent",
              borderTopWidth: 0,
              elevation: 0,
            },
            sceneStyle: {
              backgroundColor: colors.paper,
            },
          }}
        >
          <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
          <Tabs.Screen name="queue" options={{ title: "Today" }} />
          <Tabs.Screen name="appointments" options={{ title: "Appts" }} />
          <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
          <Tabs.Screen name="patients" options={{ title: "Patients" }} />
          <Tabs.Screen
            name="analytics"
            options={{ href: null, title: "Analytics", headerShown: true }}
          />
          <Tabs.Screen
            name="payments"
            options={{ href: null, title: "Payments", headerShown: true }}
          />
          <Tabs.Screen name="profile" options={{ title: "More" }} />
          <Tabs.Screen
            name="subscriptions"
            options={{ href: null, title: "Plans", headerShown: true }}
          />
          <Tabs.Screen
            name="visit/[bookingId]"
            options={{ href: null, title: "Visit", headerShown: true }}
          />
          <Tabs.Screen
            name="schedule"
            options={{ href: null, title: "Hours", headerShown: true }}
          />
          <Tabs.Screen
            name="overrides"
            options={{ href: null, headerShown: true }}
          />
          <Tabs.Screen
            name="inbox"
            options={{ href: null, title: "Inbox", headerShown: true }}
          />
          <Tabs.Screen
            name="notifications"
            options={{ href: null, title: "Notifications", headerShown: true }}
          />
          <Tabs.Screen
            name="queries"
            options={{ href: null, title: "Help", headerShown: true }}
          />
        </Tabs>
        <GlucoBotFab />
      </SafeAreaView>
      </PracticeLiveProvider>
    </PracticeProvider>
  );
}
