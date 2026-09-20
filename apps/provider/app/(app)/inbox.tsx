import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  PageTitle,
} from "@/components/ui";
import { usePractice } from "@/lib/practiceContext";
import { fetchConversations, setConversationStatus } from "@/lib/procto";
import { colors, radii, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";

type Conv = {
  id: string;
  patientPhone: string;
  status: string;
  updatedAt: string;
};

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, membership } = usePractice();
  const [rows, setRows] = useState<Conv[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!practiceId) return;
      const res = await fetchConversations(practiceId);
      if (res.status === "successful") {
        setRows((res.data as Conv[]) ?? []);
        if (!opts?.silent) setError("");
      } else if (!opts?.silent) {
        setError(res.message || "Could not load WhatsApp threads");
      }
    },
    [practiceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useProctoLiveSocket(
    practiceId,
    (event) => {
      if (
        event &&
        typeof event === "object" &&
        "event" in event &&
        event.event === "conversation_updated"
      ) {
        void load({ silent: true });
      }
    },
    () => void load({ silent: true }),
  );

  async function setStatus(
    id: string,
    status: "bot_active" | "handed_off" | "closed",
  ) {
    if (!practiceId) return;
    setBusyId(id);
    const res = await setConversationStatus(practiceId, id, status);
    setBusyId(null);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    await load();
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentBottomPad(insets.bottom, { fab: true }) },
      ]}
    >
      <PageTitle
        eyebrow={membership?.practice.name}
        title="WhatsApp inbox"
        subtitle="Take over to silence the AI bot, or return the thread to bot_active."
      />
      <ErrorText text={error} />
      {rows.length === 0 ? (
        <EmptyState text="No WhatsApp conversations yet." />
      ) : (
        rows.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.phone}>{c.patientPhone}</Text>
            <Text style={styles.meta}>
              {c.status} · {new Date(c.updatedAt).toLocaleString()}
            </Text>
            <View style={styles.actions}>
              <Chip
                label="Take over"
                active={c.status === "handed_off"}
                onPress={
                  busyId === c.id
                    ? undefined
                    : () => void setStatus(c.id, "handed_off")
                }
              />
              <Chip
                label="Bot"
                active={c.status === "bot_active"}
                onPress={
                  busyId === c.id
                    ? undefined
                    : () => void setStatus(c.id, "bot_active")
                }
              />
              <Chip
                label="Close"
                onPress={
                  busyId === c.id
                    ? undefined
                    : () => void setStatus(c.id, "closed")
                }
              />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radii.xl,
  },
  phone: { fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { marginTop: space.xs, fontSize: 12, color: colors.inkSoft },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.md,
  },
});
