import { useCallback, useEffect, useState } from "react";
import {
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
  attachPatientVisitDocument,
  getCareMessages,
  normalizeMsg,
  sendCareMessage,
  type CareChatMessage,
} from "@/lib/chat";
import { formatPracticeDateTime } from "@/lib/practiceTime";
import { colors, radii, space } from "@/lib/theme";
import {
  pickVisitDocument,
  pickVisitPhoto,
  uploadVisitFile,
} from "@/lib/visitUpload";

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
  onDocumentAttached?: () => void;
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
  onDocumentAttached,
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
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!selfUserId || !peerUserId) return;
      if (!opts?.soft) setLoading(true);
      setError("");
      const res = await getCareMessages(selfUserId, peerUserId, { bookingId });
      if (!opts?.soft) setLoading(false);
      if (res.error) {
        if (!opts?.soft) setError(res.error);
        return;
      }
      setMessages(
        res.messages.filter((m) => inVisitWindow(m.createdAt, threadSince)),
      );
    },
    [selfUserId, peerUserId, bookingId, threadSince],
  );

  useEffect(() => {
    if (active) void load();
    else setLoading(false);
  }, [load, active]);

  useLiveSocket({
    path: selfUserId ? `/api/v1/ws/chats/${selfUserId}` : null,
    enabled: Boolean(active && selfUserId && peerUserId),
    onEvent: (event) => {
      const msg = normalizeMsg(event as Record<string, unknown>);
      if (msg.type !== "direct" || !msg.id || !msg.content) return;
      const involvesPeer =
        msg.senderId === peerUserId ||
        msg.receiverId === peerUserId ||
        msg.senderId === selfUserId;
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
    if (!content || sending || attaching) return;
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

  async function attachPicked(file: {
    uri: string;
    name: string;
    mimeType: string;
  }) {
    if (!bookingId || attaching) return;
    setAttaching(true);
    setError("");
    try {
      const uploaded = await uploadVisitFile(file);
      const caption = draft.trim() || undefined;
      const res = await attachPatientVisitDocument(bookingId, {
        name: uploaded.name,
        url: uploaded.url,
        caption,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message!.id)) return prev;
          return [...prev, res.message!];
        });
      }
      if (caption) setDraft("");
      onDocumentAttached?.();
    } catch {
      setError("Could not attach that file. Try again.");
    } finally {
      setAttaching(false);
    }
  }

  async function attachPhoto() {
    const picked = await pickVisitPhoto();
    if (picked === "denied") {
      setError("Photo access was blocked. Allow photos in Settings.");
      return;
    }
    if (!picked) return;
    await attachPicked(picked);
  }

  async function attachFile() {
    const picked = await pickVisitDocument();
    if (!picked) return;
    await attachPicked(picked);
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
            <Text style={styles.title}>Chat with {peerName}</Text>
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
          <Text style={styles.title}>Chat with {peerName}</Text>
          <Text style={styles.sub}>
            {subtitle ||
              "Messages sync both ways with WhatsApp when linked to this clinic. Attach reports from the paperclip below."}
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
            {loading ? "Loading…" : "No messages yet. Say hello to your doctor."}
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
        {bookingId ? (
          <View style={styles.attachRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach photo"
              disabled={attaching || sending}
              onPress={() => void attachPhoto()}
              style={[styles.attachBtn, attaching && styles.attachBusy]}
            >
              <Text style={styles.attachBtnText}>
                {attaching ? "…" : "Photo"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach file"
              disabled={attaching || sending}
              onPress={() => void attachFile()}
              style={[styles.attachBtn, attaching && styles.attachBusy]}
            >
              <Text style={styles.attachBtnText}>File / PDF</Text>
            </Pressable>
          </View>
        ) : null}
        <PrimaryButton
          label="Send"
          onPress={() => void send()}
          busy={sending || attaching}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.lg,
    backgroundColor: colors.white,
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
    borderBottomColor: colors.brandMist,
  },
  collapsed: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  showBtn: {
    backgroundColor: colors.navy,
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
    borderColor: colors.brandMist,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hideBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
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
    backgroundColor: colors.navy,
  },
  bubblePeer: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandLight,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  bubbleTextMine: {
    color: colors.white,
  },
  stamp: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
  },
  stampMine: {
    color: "rgba(255,255,255,0.72)",
    textAlign: "right",
  },
  stampPeer: {
    color: colors.inkFaint,
  },
  composer: {
    padding: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandMist,
  },
  attachRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  attachBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brandMist,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBusy: { opacity: 0.55 },
  attachBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.navy,
  },
  input: {
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.brandMist,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
});
