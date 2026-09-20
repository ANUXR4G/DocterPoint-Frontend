import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ErrorText, PrimaryButton } from "@/components/ui";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import {
  getCareMessages,
  normalizeMsg,
  sendCareMessage,
  type CareChatMessage,
} from "@/lib/chat";
import { colors, space } from "@/lib/theme";

type Props = {
  selfUserId: string;
  peerUserId: string;
  peerName: string;
  subtitle?: string;
};

/** Message panel safe inside parent ScrollViews (no nested VirtualizedList). */
export function CareChatPanel({
  selfUserId,
  peerUserId,
  peerName,
  subtitle,
}: Props) {
  const [messages, setMessages] = useState<CareChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selfUserId || !peerUserId) return;
      if (!opts?.soft) setLoading(true);
      setError("");
      const res = await getCareMessages(selfUserId, peerUserId);
      if (!opts?.soft) setLoading(false);
      if (res.error) {
        if (!opts?.soft) setError(res.error);
        return;
      }
      setMessages(res.messages);
    },
    [selfUserId, peerUserId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSocket({
    path: selfUserId ? `/api/v1/ws/chats/${selfUserId}` : null,
    enabled: Boolean(selfUserId && peerUserId),
    onEvent: (event) => {
      const msg = normalizeMsg(event as Record<string, unknown>);
      if (msg.type !== "direct" || !msg.id || !msg.content) return;
      const involvesPeer =
        msg.senderId === peerUserId ||
        msg.receiverId === peerUserId ||
        msg.senderId === selfUserId;
      if (!involvesPeer) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    },
    onReconnect: () => void load({ soft: true }),
  });

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    const res = await sendCareMessage(peerUserId, content);
    setSending(false);
    if (res.error || !res.message) {
      setError(res.error || "Send failed");
      return;
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === res.message!.id)) return prev;
      return [...prev, res.message!];
    });
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.wrap}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Care chat · {peerName}</Text>
        <Text style={styles.sub}>
          {subtitle ||
            "Messages also send to the patient’s WhatsApp when their clinic line is live."}
        </Text>
      </View>

      <View style={styles.listContent}>
        {messages.length === 0 ? (
          <Text style={styles.empty}>
            {loading
              ? "Loading…"
              : "No messages yet. Message the patient here."}
          </Text>
        ) : (
          messages.map((item) => {
            const mine = item.senderId === selfUserId;
            return (
              <View
                key={item.id}
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubblePeer,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    mine ? styles.bubbleTextMine : null,
                  ]}
                >
                  {item.content}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <ErrorText text={error} />
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          multiline
          maxLength={4000}
        />
        <PrimaryButton label="Send" onPress={() => void send()} busy={sending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.lg,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  sub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 17,
  },
  listContent: {
    padding: space.md,
    paddingBottom: space.lg,
    minHeight: 120,
  },
  empty: {
    textAlign: "center",
    color: colors.inkFaint,
    fontSize: 13,
    marginTop: space.md,
    marginBottom: space.md,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
  },
  bubblePeer: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandMist,
  },
  bubbleText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  bubbleTextMine: { color: colors.white },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    padding: space.md,
    gap: space.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    minHeight: 44,
    maxHeight: 100,
  },
});
