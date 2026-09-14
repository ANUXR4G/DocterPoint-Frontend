import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CareChatPanel } from "@/components/CareChatPanel";
import { ErrorText, Loading, Screen } from "@/components/ui";
import { listCareThreads } from "@/lib/chat";
import { getSessionUserId } from "@/lib/sessionUser";
import { colors, space } from "@/lib/theme";

export default function MessageThreadScreen() {
  const { peerId } = useLocalSearchParams<{ peerId: string }>();
  const router = useRouter();
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [peerName, setPeerName] = useState("Doctor");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await getSessionUserId();
      if (cancelled) return;
      if (!uid || !peerId) {
        setError("Missing chat participants.");
        setReady(true);
        return;
      }
      setSelfUserId(uid);
      const threads = await listCareThreads();
      const match = threads.threads.find((t) => t.peerId === peerId);
      if (match?.name) setPeerName(match.name);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [peerId]);

  if (!ready) return <Loading />;

  if (!selfUserId || !peerId) {
    return (
      <Screen>
        <View style={styles.content}>
          <ErrorText text={error || "Chat unavailable."} />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Text style={styles.back}>← Messages</Text>
        </Pressable>
        <CareChatPanel
          selfUserId={selfUserId}
          peerUserId={peerId}
          peerName={peerName}
          subtitle="Clinic messages also arrive on WhatsApp when your doctor texts you."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: space.lg,
    paddingBottom: 100,
  },
  backRow: { marginBottom: space.sm },
  back: {
    color: colors.brand,
    fontWeight: "600",
    fontSize: 14,
  },
});
