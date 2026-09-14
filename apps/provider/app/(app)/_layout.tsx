import { Tabs } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { GlucoBotFab } from "@/components/GlucoBotFab";
import { FloatingDock, type FloatingDockProps } from "@/components/mobile/FloatingDock";
import { Loading } from "@/components/ui";
import { clearSession } from "@/lib/api";
import {
  PracticeProvider,
  pickProviderId,
} from "@/lib/practiceContext";
import { fetchMyPractices } from "@/lib/procto";
import type { PracticeMembership } from "@/lib/types";
import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";

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

  if (!ready) return <Loading />;

  if (!membership) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: colors.paper,
        }}
      >
        <Text
          style={{
            color: colors.ink,
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          No clinic linked
        </Text>
        <Text style={{ color: colors.inkSoft, marginBottom: 20, lineHeight: 20 }}>
          {loadError ||
            "This doctor account has no practice membership yet. Finish onboarding on the web clinic portal, then sign in again."}
        </Text>
        <Pressable
          onPress={() => void handleLogout()}
          style={{
            backgroundColor: colors.brand,
            borderRadius: 12,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <PracticeProvider value={value}>
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
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
          <Tabs.Screen name="queue" options={{ title: "Today" }} />
          <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
          <Tabs.Screen name="patients" options={{ title: "Patients" }} />
          <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
          <Tabs.Screen name="profile" options={{ title: "More" }} />
          <Tabs.Screen
            name="appointments"
            options={{ href: null, title: "Appointments", headerShown: true }}
          />
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
            name="queries"
            options={{ href: null, title: "Help", headerShown: true }}
          />
        </Tabs>
        <GlucoBotFab />
      </View>
    </PracticeProvider>
  );
}
