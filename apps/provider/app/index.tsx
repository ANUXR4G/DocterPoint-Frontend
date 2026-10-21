import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { getToken } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [seenWelcome, setSeenWelcome] = useState(true);

  useEffect(() => {
    Promise.all([getToken(), SecureStore.getItemAsync("gg.preLoginWelcome")]).then(
      ([token, welcome]) => {
        setAuthed(!!token);
        setSeenWelcome(welcome === "1");
        setReady(true);
      },
    );
  }, []);

  if (!ready) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.paper,
        }}
        edges={["top", "left", "right", "bottom"]}
      >
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (authed) return <Redirect href="/(app)/dashboard" />;
  return (
    <Redirect href={(seenWelcome ? "/(auth)/login" : "/(auth)/welcome") as never} />
  );
}
