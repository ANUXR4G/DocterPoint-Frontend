import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  FloatingDock,
  type FloatingDockProps,
} from "@/components/mobile/FloatingDock";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { getToken } from "@/lib/api";
import { PatientLiveProvider } from "@/lib/PatientLiveContext";
import { onSessionExpired } from "@/lib/sessionEvents";
import { useCareTheme } from "@/lib/careTheme";
import { colors } from "@/lib/theme";

export default function AppLayout() {
  const { theme } = useCareTheme();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => {
      if (!cancelled) {
        setAuthed(!!t);
        setReady(true);
      }
    });
    const unsub = onSessionExpired(() => setAuthed(false));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!ready) {
    return <ThinkingLoader fullPage label="Loading" />;
  }

  if (!authed) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <PatientLiveProvider>
      <Tabs
        tabBar={(props) => <FloatingDock {...(props as FloatingDockProps)} />}
        screenOptions={{
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
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
          },
          sceneStyle: {
            backgroundColor: theme.paper,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Dashboard",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="record"
          options={{
            href: null,
            title: "Calendar",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="doctors"
          options={{
            title: "Find clinics",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="appointments"
          options={{
            title: "My Bookings",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="queries"
          options={{
            href: null,
            title: "Help & Support",
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
            title: "Theme",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="doctor/[slug]"
          options={{
            href: null,
            title: "Appointment",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="bookings/[bookingId]"
          options={{
            href: null,
            title: "Visit details",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="messages/[peerId]"
          options={{
            href: null,
            title: "Message",
          }}
        />
      </Tabs>
      </PatientLiveProvider>
    </View>
  );
}
