import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { getToken } from "@/lib/api";

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
    return <ThinkingLoader fullPage label="Loading" />;
  }

  return <Redirect href={authed ? "/(app)/home" : "/(auth)/login"} />;
}
