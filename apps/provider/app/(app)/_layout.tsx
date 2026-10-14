import { Tabs, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GlucoBotFab } from "@/components/GlucoBotFab";
import { AppTopBar } from "@/components/mobile/AppTopBar";
import { CareTabBar } from "@/components/mobile/CareTabBar";
import { useCareTheme } from "@/lib/careTheme";
import { Loading } from "@/components/ui";
import { clearSession } from "@/lib/api";
import {
  beginBootstrapFetch,
  endBootstrapFetch,
  getCachedMemberships,
  getCachedPracticeIndex,
  nearBookingRange,
  setBootstrapSeed,
  setCachedMemberships,
  setCachedPracticeIndex,
} from "@/lib/dataCache";
import {
  PracticeProvider,
  pickProviderId,
} from "@/lib/practiceContext";
import { PracticeLiveProvider } from "@/lib/PracticeLiveContext";
import { fetchMyPractices, fetchPracticeBootstrap } from "@/lib/procto";
import type { PracticeMembership } from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";

export default function AppLayout() {
  const router = useRouter();
  const { theme } = useCareTheme();
  const cachedMemberships = getCachedMemberships();
  const [memberships, setMemberships] = useState<PracticeMembership[]>(
    () => cachedMemberships ?? [],
  );
  const [practiceIndex, setPracticeIndexState] = useState(() => {
    const cached = getCachedPracticeIndex();
    const list = cachedMemberships ?? [];
    return cached < list.length ? cached : 0;
  });
  const [ready, setReady] = useState(() => Boolean(cachedMemberships?.length));
  const [loadError, setLoadError] = useState("");

  const setPracticeIndex = useCallback((i: number) => {
    setPracticeIndexState(i);
    setCachedPracticeIndex(i);
  }, []);

  const refresh = useCallback(async () => {
    setLoadError("");
    const list = memberships.length
      ? memberships
      : getCachedMemberships() ?? [];
    const idx = Math.min(practiceIndex, Math.max(list.length - 1, 0));
    const practiceId = list[idx]?.practice.id;
    const range = nearBookingRange();

    beginBootstrapFetch();
    const boot = await fetchPracticeBootstrap({
      from: range.from,
      to: range.to,
      practiceId,
    });

    if (boot.status === "successful" && boot.data?.memberships) {
      const next = boot.data.memberships as PracticeMembership[];
      setMemberships(next);
      setCachedMemberships(next);
      const resolvedId = boot.data.practiceId || practiceId;
      if (resolvedId) {
        setBootstrapSeed({
          practiceId: resolvedId,
          bookings: Array.isArray(boot.data.bookings) ? boot.data.bookings : [],
          patients: Array.isArray(boot.data.patients) ? boot.data.patients : [],
        });
      } else {
        endBootstrapFetch();
      }
      setReady(true);
      return;
    }

    // Fallback: memberships only (live layer loads bookings next).
    const res = await fetchMyPractices();
    if (res.status !== "successful") {
      endBootstrapFetch();
      await clearSession();
      router.replace("/(auth)/login");
      return;
    }
    const next = (res.data as PracticeMembership[]) ?? [];
    setMemberships(next);
    setCachedMemberships(next);
    endBootstrapFetch();
    setReady(true);
  }, [router, memberships, practiceIndex]);

  useEffect(() => {
    void refresh();
    // Cold start / cache hydrate once; pull-to-refresh uses practice.refresh later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    [memberships, membership, providerId, practiceIndex, setPracticeIndex, refresh],
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
          style={{ flex: 1, backgroundColor: theme.paper }}
          edges={["top", "left", "right"]}
        >
          <View style={{ flex: 1 }}>
            <AppTopBar />
            <Tabs
              tabBar={() => null}
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
                headerStatusBarHeight: 0,
                tabBarStyle: { display: "none" },
                sceneStyle: {
                  backgroundColor: theme.paper,
                },
              }}
            >
              <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
              <Tabs.Screen name="queue" options={{ title: "Queue" }} />
              <Tabs.Screen
                name="appointments"
                options={{ title: "Appointments" }}
              />
              <Tabs.Screen name="patients" options={{ title: "Patients" }} />
              <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
              <Tabs.Screen
                name="analytics"
                options={{ href: null, title: "Analytics" }}
              />
              <Tabs.Screen
                name="payments"
                options={{ href: null, title: "Payments" }}
              />
              <Tabs.Screen name="profile" options={{ title: "Account" }} />
              <Tabs.Screen
                name="subscriptions"
                options={{ href: null, title: "Subscription" }}
              />
              <Tabs.Screen
                name="visit/[bookingId]"
                options={{ href: null, title: "Visit" }}
              />
              <Tabs.Screen
                name="schedule"
                options={{ href: null, title: "Hours & blocks" }}
              />
              <Tabs.Screen
                name="overrides"
                options={{ href: null, title: "Blocks" }}
              />
              <Tabs.Screen
                name="inbox"
                options={{ href: null, title: "Patient Support" }}
              />
              <Tabs.Screen
                name="notifications"
                options={{ href: null, title: "Notifications" }}
              />
              <Tabs.Screen
                name="queries"
                options={{ href: null, title: "Help & Support" }}
              />
              <Tabs.Screen
                name="settings"
                options={{ title: "Settings" }}
              />
              <Tabs.Screen
                name="doctors"
                options={{ title: "Doctors" }}
              />
              <Tabs.Screen
                name="audit"
                options={{ title: "Audit log" }}
              />
            </Tabs>
            <CareTabBar />
            <GlucoBotFab />
          </View>
        </SafeAreaView>
      </PracticeLiveProvider>
    </PracticeProvider>
  );
}
