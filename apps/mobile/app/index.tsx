import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { getToken } from "@/lib/api";

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
    return <ThinkingLoader fullPage label="Loading" />;
  }

  if (authed) return <Redirect href="/(app)/home" />;
  return (
    <Redirect href={(seenWelcome ? "/(auth)/login" : "/(auth)/welcome") as never} />
  );
}
