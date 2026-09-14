import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { TypedText } from "@/components/TypedText";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  assistantChat,
  assistantStatus,
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  type AssistantChatMessage,
  type AssistantConversationSummary,
} from "@/lib/assistant";
import { colors, space } from "@/lib/theme";
import { dockClearance } from "@/lib/dockLayout";

type UiMessage = AssistantChatMessage & { id: string; animate?: boolean };

const WELCOME = "Hi — how can I help?";

type Props = {
  compact?: boolean;
  style?: ViewStyle;
};

function welcomeMessages(): UiMessage[] {
  return [{ id: "welcome", role: "assistant", content: WELCOME }];
}

function MicButton({
  active,
  disabled,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? "Stop voice input" : "Record voice message"}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.micButton,
        active && styles.micButtonActive,
        disabled && styles.micButtonDisabled,
        pressed && !disabled && styles.micButtonPressed,
      ]}
    >
      <Ionicons
        name={active ? "stop" : "mic"}
        size={20}
        color={active ? "#dc2626" : colors.ink}
      />
    </Pressable>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MiraChat({ compact = false, style }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>(welcomeMessages);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("Mira");
  const [panel, setPanel] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<AssistantConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const listRef = useRef<FlatList<UiMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const baseInputRef = useRef("");
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const {
    listening,
    processing,
    error: voiceError,
    toggle: toggleVoice,
    stop: stopVoice,
    clearError: clearVoiceError,
  } = useSpeechRecognition({
    continuous: true,
    liveTranscript: true,
    onInterimTranscript: (text) => {
      const base = baseInputRef.current;
      setInput(base ? `${base} ${text}` : text);
    },
    onFinalTranscript: (text) => {
      if (!text) return;
      const base = baseInputRef.current.trim();
      const merged = base ? `${base} ${text}` : text;
      baseInputRef.current = merged;
      setInput(merged);
      inputRef.current?.focus();
    },
  });

  useEffect(() => {
    void assistantStatus()
      .then((res) => {
        if (res.status === "successful") {
          setAvailable(Boolean(res.data?.available ?? true));
          return;
        }
        setAvailable(null);
      })
      .catch(() => setAvailable(null));
  }, []);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  const startNewChat = useCallback(() => {
    stopVoice();
    setPanel("chat");
    setConversationId(null);
    setConversationTitle("Mira");
    setMessages(welcomeMessages());
    setInput("");
    baseInputRef.current = "";
    setHistoryError(null);
  }, [stopVoice]);

  const openHistory = useCallback(async () => {
    stopVoice();
    setPanel("history");
    setHistoryLoading(true);
    setHistoryError(null);
    const res = await listAssistantConversations();
    setHistoryLoading(false);
    if (res.status !== "successful") {
      setHistory([]);
      setHistoryError(
        res.message?.includes("Sign in") || res.message?.includes("401")
          ? "Sign in to see saved chats."
          : res.message || "Could not load chat history.",
      );
      return;
    }
    setHistory(res.data ?? []);
  }, [stopVoice]);

  const openConversation = useCallback(
    async (id: string) => {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await getAssistantConversation(id);
      setHistoryLoading(false);
      if (res.status !== "successful" || !res.data) {
        setHistoryError(res.message || "Could not open that chat.");
        return;
      }
      setConversationId(res.data.id);
      setConversationTitle(res.data.title || "Mira");
      const loaded: UiMessage[] =
        res.data.messages.length > 0
          ? res.data.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))
          : welcomeMessages();
      setMessages(loaded);
      setPanel("chat");
    },
    [],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      const res = await deleteAssistantConversation(id);
      if (res.status !== "successful") return;
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (conversationIdRef.current === id) startNewChat();
    },
    [startNewChat],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    baseInputRef.current = "";
    stopVoice();

    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    const historyForModel = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .map(({ role, content }) => ({ role, content }));

    const res = await assistantChat(
      text,
      historyForModel,
      conversationIdRef.current,
    );
    setBusy(false);

    if (res.status !== "successful" || !res.data?.reply) {
      const detail =
        res.message?.trim() ||
        "Sorry, that didn’t go through. Check the API is running, then try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: detail,
          animate: true,
        },
      ]);
      return;
    }

    setAvailable(true);
    if (res.data.conversationId) {
      setConversationId(res.data.conversationId);
      conversationIdRef.current = res.data.conversationId;
    }
    if (res.data.title) setConversationTitle(res.data.title);

    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.data!.reply,
        animate: true,
      },
    ]);
  }, [busy, input, messages, stopVoice]);

  const composerBottomPad = compact ? space.xs : dockClearance;

  return (
    <View style={[styles.flex, style]}>
      {!compact ? (
      <View style={styles.toolbar}>
        <View style={styles.toolbarText}>
          <Text style={styles.title} numberOfLines={1}>
            {panel === "history" ? "Chat history" : conversationTitle}
          </Text>
          <Text style={styles.status}>
            {panel === "history"
              ? "Previous Mira chats"
              : available === false
                ? "Away"
                : available === null
                  ? "Connecting…"
                  : "Online"}
          </Text>
        </View>
        <View style={styles.toolbarActions}>
          {panel === "history" ? (
            <Pressable
              onPress={() => setPanel("chat")}
              style={styles.toolBtn}
              accessibilityLabel="Back to chat"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.ink} />
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => void openHistory()}
                style={styles.toolBtn}
                accessibilityLabel="Open chat history"
              >
                <Ionicons name="time-outline" size={20} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={startNewChat}
                style={styles.toolBtn}
                accessibilityLabel="Start new chat"
              >
                <Ionicons name="create-outline" size={20} color={colors.ink} />
              </Pressable>
            </>
          )}
        </View>
      </View>
      ) : (
      <View style={styles.compactBar}>
        <View style={styles.toolbarActions}>
          {panel === "history" ? (
            <Pressable
              onPress={() => setPanel("chat")}
              style={styles.toolBtn}
              accessibilityLabel="Back to chat"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.ink} />
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => void openHistory()}
                style={styles.toolBtn}
                accessibilityLabel="Open chat history"
              >
                <Ionicons name="time-outline" size={20} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={startNewChat}
                style={styles.toolBtn}
                accessibilityLabel="Start new chat"
              >
                <Ionicons name="create-outline" size={20} color={colors.ink} />
              </Pressable>
            </>
          )}
        </View>
      </View>
      )}

      {panel === "history" ? (
        <View style={styles.historyWrap}>
          {historyLoading ? (
            <ThinkingLoader
              size={64}
              state="searching"
              label="Loading history"
              style={{ marginTop: 48 }}
            />
          ) : historyError ? (
            <Text style={styles.historyEmpty}>{historyError}</Text>
          ) : history.length === 0 ? (
            <Text style={styles.historyEmpty}>
              No saved chats yet. Send a message and it will show up here.
            </Text>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.historyList}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void openConversation(item.id)}
                  style={({ pressed }) => [
                    styles.historyRow,
                    pressed && styles.historyRowPressed,
                  ]}
                >
                  <View style={styles.historyMain}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.preview ? (
                      <Text style={styles.historyPreview} numberOfLines={2}>
                        {item.preview}
                      </Text>
                    ) : null}
                    <Text style={styles.historyWhen}>
                      {formatWhen(item.updatedAt)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void removeConversation(item.id)}
                    hitSlop={10}
                    accessibilityLabel="Delete chat"
                    style={styles.historyDelete}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}
          <Pressable onPress={startNewChat} style={styles.newChatBanner}>
            <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            <Text style={styles.newChatBannerText}>New chat</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={!compact}
            contentContainerStyle={[
              styles.list,
              compact && styles.listCompact,
            ]}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubbleWrap,
                  item.role === "user" ? styles.wrapEnd : styles.wrapStart,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    item.role === "user" ? styles.userBubble : styles.botBubble,
                  ]}
                >
                  {item.role === "assistant" && item.animate ? (
                    <TypedText text={item.content} style={styles.bubbleText} />
                  ) : (
                    <Text
                      style={[
                        styles.bubbleText,
                        item.role === "user" && styles.userText,
                      ]}
                    >
                      {item.content}
                    </Text>
                  )}
                </View>
              </View>
            )}
            ListFooterComponent={
              busy ? (
                <View style={[styles.bubbleWrap, styles.wrapStart]}>
                  <View style={[styles.bubble, styles.botBubble, styles.typing]}>
                    <View style={styles.dotsRow}>
                      <View style={[styles.dot, styles.dot1]} />
                      <View style={[styles.dot, styles.dot2]} />
                      <View style={[styles.dot, styles.dot3]} />
                    </View>
                  </View>
                </View>
              ) : null
            }
          />

          <View style={[styles.composer, { paddingBottom: composerBottomPad }]}>
            {processing ? (
              <Text style={styles.voiceStatus}>Transcribing…</Text>
            ) : listening ? (
              <Text style={styles.listeningStatus}>
                Listening… speak your message
              </Text>
            ) : !voiceError && !compact ? (
              <Text style={styles.hint}>
                Tap the mic to dictate — review the text, then send.
              </Text>
            ) : null}
            {voiceError ? (
              <Text style={styles.voiceError}>{voiceError}</Text>
            ) : null}

            <View style={styles.composerRow}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={(text) => {
                  clearVoiceError();
                  baseInputRef.current = text;
                  setInput(text);
                }}
                placeholder="Message…"
                placeholderTextColor={colors.inkFaint}
                editable={!busy && available !== false && !processing}
                style={styles.input}
                multiline
                maxLength={2000}
                blurOnSubmit={false}
              />
              <MicButton
                active={listening || processing}
                disabled={busy || available === false || processing}
                onPress={() => {
                  clearVoiceError();
                  if (!listening) baseInputRef.current = input.trim();
                  toggleVoice();
                }}
              />
              <Pressable
                onPress={() => void send()}
                disabled={busy || !input.trim() || available === false}
                style={[
                  styles.send,
                  (busy || !input.trim() || available === false) &&
                    styles.sendDisabled,
                ]}
              >
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 8,
  },
  compactBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  toolbarText: { flex: 1, minWidth: 0 },
  toolbarActions: { flexDirection: "row", gap: 4 },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  status: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  historyWrap: { flex: 1 },
  historyList: { padding: space.lg, paddingBottom: space.xl },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.sky50,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  historyRowPressed: { opacity: 0.85 },
  historyMain: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  historyPreview: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  historyWhen: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: colors.inkFaint,
  },
  historyDelete: { padding: 6 },
  historyEmpty: {
    marginTop: 32,
    marginHorizontal: space.xl,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  newChatBanner: {
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
  },
  newChatBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand,
  },
  list: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    paddingBottom: space.xl,
  },
  listCompact: {
    paddingTop: space.sm,
  },
  bubbleWrap: {
    marginBottom: space.sm,
    flexDirection: "row",
  },
  wrapStart: { justifyContent: "flex-start" },
  wrapEnd: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botBubble: {
    backgroundColor: colors.brandMist,
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  userText: {
    color: colors.white,
  },
  typing: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inkSoft,
    opacity: 0.5,
  },
  dot1: { opacity: 0.35 },
  dot2: { opacity: 0.55 },
  dot3: { opacity: 0.75 },
  composer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    backgroundColor: colors.white,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.sky50,
  },
  micButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sky50,
  },
  micButtonActive: {
    borderColor: "#f87171",
    backgroundColor: "#fef2f2",
  },
  micButtonDisabled: { opacity: 0.45 },
  micButtonPressed: { opacity: 0.85 },
  send: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.navy,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: -0.1,
  },
  voiceStatus: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  listeningStatus: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  voiceError: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
  hint: {
    marginBottom: 8,
    fontSize: 11,
    color: colors.inkFaint,
  },
});
