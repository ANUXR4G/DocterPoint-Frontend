import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getToken } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      setAuthed(!!t);
      setReady(true);
    });
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

  return <Redirect href={authed ? "/(app)/dashboard" : "/(auth)/login"} />;
}
