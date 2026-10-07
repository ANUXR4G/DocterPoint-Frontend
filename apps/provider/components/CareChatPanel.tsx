import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { shouldHideFromCareChat } from "@/lib/careChatFilter";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  selfUserId: string;
  peerUserId: string;
  peerName: string;
  subtitle?: string;
  /** Scope the thread to this visit (hides earlier appointments). */
  bookingId?: string | null;
  threadSince?: string | null;
  /** Visit chat collapses by default when bookingId is set. */
  collapsible?: boolean;
  defaultOpen?: boolean;
};

function inVisitWindow(createdAt: string, since?: string | null): boolean {
  if (!since) return true;
  const t = Date.parse(createdAt);
  const s = Date.parse(since);
  if (Number.isNaN(t) || Number.isNaN(s)) return true;
  return t >= s;
}

/** Message panel safe inside parent ScrollViews (no nested VirtualizedList). */
export function CareChatPanel({
  selfUserId,
  peerUserId,
  peerName,
  subtitle,
  bookingId,
  threadSince,
  collapsible,
  defaultOpen,
}: Props) {
  const isCollapsible = collapsible ?? Boolean(bookingId);
  const [open, setOpen] = useState(() =>
    isCollapsible ? Boolean(defaultOpen) : true,
  );
  const active = !isCollapsible || open;
  const [messages, setMessages] = useState<CareChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selfUserId || !peerUserId) return;
      if (!opts?.soft) setLoading(true);
      if (!opts?.soft) setError("");
      const res = await getCareMessages(selfUserId, peerUserId, { bookingId });
      if (!opts?.soft) setLoading(false);
      if (res.error) {
        if (!opts?.soft) setError(res.error);
        return;
      }
      setMessages(
        res.messages.filter(
          (m) =>
            !shouldHideFromCareChat(m.content) &&
            inVisitWindow(m.createdAt, threadSince),
        ),
      );
    },
    [selfUserId, peerUserId, bookingId, threadSince],
  );

  useEffect(() => {
    if (active) void load();
    else setLoading(false);
  }, [load, active]);

  // WhatsApp inbound often lands while the Expo WS is idle — poll like web.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      void load({ soft: true });
    }, 4000);
    return () => clearInterval(id);
  }, [load, active]);

  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load({ soft: true });
    });
    return () => sub.remove();
  }, [load, active]);

  useLiveSocket({
    path: selfUserId ? `/api/v1/ws/chats/${selfUserId}` : null,
    enabled: Boolean(active && selfUserId && peerUserId),
    onEvent: (event) => {
      const msg = normalizeMsg(event as Record<string, unknown>);
      if (msg.type !== "direct" || !msg.id || !msg.content) return;
      if (shouldHideFromCareChat(msg.content)) return;
      const involvesPeer =
        msg.senderId === peerUserId ||
        msg.receiverId === peerUserId ||
        msg.senderId === selfUserId ||
        msg.receiverId === selfUserId;
      if (!involvesPeer) return;
      if (!inVisitWindow(msg.createdAt, threadSince)) return;
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

  if (isCollapsible && !open) {
    return (
      <View style={styles.wrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show chat with ${peerName}`}
          onPress={() => setOpen(true)}
          style={styles.collapsed}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Care chat · {peerName}</Text>
            <Text style={styles.sub}>Hidden · tap to open</Text>
          </View>
          <Text style={styles.showBtn}>Show</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.wrap}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Care chat · {peerName}</Text>
          <Text style={styles.sub}>
            {subtitle ||
              "Patient WhatsApp replies appear here. Your texts also go to WhatsApp when the clinic line is live."}
          </Text>
        </View>
        {isCollapsible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hide chat"
            onPress={() => setOpen(false)}
            hitSlop={8}
            style={styles.hideBtn}
          >
            <Text style={styles.hideBtnText}>Hide</Text>
          </Pressable>
        ) : null}
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
                <Text
                  style={[
                    styles.stamp,
                    mine ? styles.stampMine : styles.stampPeer,
                  ]}
                >
                  {formatPracticeDateTime(item.createdAt)}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  showBtn: {
    backgroundColor: colors.brand,
    color: colors.white,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  hideBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hideBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
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
  stamp: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
  },
  stampMine: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "right",
  },
  stampPeer: {
    color: colors.inkFaint,
  },
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
