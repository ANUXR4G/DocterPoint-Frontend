import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MiraChat } from "@/components/MiraChat";
import { ErrorText, Screen } from "@/components/ui";
import { listCareThreads, type CareChatThread } from "@/lib/chat";
import { useCareTheme } from "@/lib/careTheme";
import { colors, radii, space } from "@/lib/theme";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import { getSessionUserId } from "@/lib/sessionUser";

/** Help — doctor threads + Mira assistant. */
export default function HelpScreen() {
  const router = useRouter();
  const { theme } = useCareTheme();
  const [threads, setThreads] = useState<CareChatThread[]>([]);
  const [error, setError] = useState("");
  const [showMira, setShowMira] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listCareThreads();
    setError(res.error);
    setThreads(res.threads);
  }, []);

  useEffect(() => {
    void load();
    void getSessionUserId().then(setSelfId);
  }, [load]);

  useLiveSocket({
    path: selfId ? `/api/v1/ws/chats/${selfId}` : null,
    onEvent: () => {
      void load();
    },
    onReconnect: () => {
      void load();
    },
  });

  if (showMira) {
    return (
      <Screen style={{ backgroundColor: theme.paper }}>
        <Pressable style={styles.back} onPress={() => setShowMira(false)}>
          <Text style={[styles.backText, { color: theme.ink }]}>← Messages</Text>
        </Pressable>
        <MiraChat />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.ink }]}>Help</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          Doctor chats sync with the patient portal. Clinic texts also go to
          WhatsApp.
        </Text>

        <ErrorText text={error} />

        {threads.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.card }]}>
            <Text style={[styles.emptyTitle, { color: theme.ink }]}>No doctor chats yet</Text>
            <Text style={styles.emptyBody}>
              Open a visit and message your doctor — replies show here, on the
              web, and WhatsApp (replies from WhatsApp show up here too).
            </Text>
          </View>
        ) : (
          threads.map((t) => (
            <Pressable
              key={t.peerId}
              style={[styles.thread, { backgroundColor: theme.card }]}
              onPress={() =>
                router.push(`/(app)/messages/${t.peerId}` as Href)
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.threadName, { color: theme.ink }]}>{t.name}</Text>
                <Text style={styles.threadPreview} numberOfLines={1}>
                  {t.lastMessage}
                </Text>
              </View>
              {t.unread > 0 ? (
                <View style={[styles.badge, { backgroundColor: theme.ink }]}>
                  <Text style={styles.badgeText}>{t.unread}</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        )}

        <Pressable style={[styles.miraBtn, { backgroundColor: theme.ink }]} onPress={() => setShowMira(true)}>
          <Text style={styles.miraBtnText}>Ask Mira (booking help)</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.xl,
    paddingBottom: 120,
  },
  back: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  backText: {
    color: colors.brand,
    fontWeight: "600",
    fontSize: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.inkFaint,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  sub: {
    marginTop: 8,
    marginBottom: space.xl,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.xl,
    marginBottom: space.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  thread: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.lg,
    marginBottom: space.sm,
  },
  threadName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  threadPreview: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  miraBtn: {
    marginTop: space.xl,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.navy,
  },
  miraBtnText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
});
