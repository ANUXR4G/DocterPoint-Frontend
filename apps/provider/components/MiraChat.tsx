import { SvgIcon } from "@/components/icons/SvgIcon";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { TypedText } from "@/components/TypedText";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  assistantChat,
  assistantStatus,
  type AssistantChatMessage,
} from "@/lib/assistant";
import { colors, radii, space } from "@/lib/theme";

type UiMessage = AssistantChatMessage & { id: string; animate?: boolean };

const WELCOME = "Hi — how can I help?";

type Props = {
  compact?: boolean;
  style?: ViewStyle;
};

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
      <SvgIcon
        name={active ? "stop" : "mic"}
        size={20}
        color={active ? colors.white : colors.brand}
      />
    </Pressable>
  );
}

export function MiraChat({ compact = false, style }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const listRef = useRef<FlatList<UiMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const baseInputRef = useRef("");

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
    void assistantStatus().then((res) => {
      setAvailable(Boolean(res.data?.available ?? res.status === "successful"));
    });
  }, []);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

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

    const history = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .map(({ role, content }) => ({ role, content }));

    const res = await assistantChat(text, history);
    setBusy(false);

    if (res.status !== "successful" || !res.data?.reply) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Sorry, that didn’t go through. Try again in a sec.",
          animate: true,
        },
      ]);
      return;
    }

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

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={compact ? 0 : 88}
    >
      {!compact ? (
        <View style={styles.header}>
          <Text style={styles.title}>Mira</Text>
          <Text style={styles.status}>
            {available === false ? "Away" : "Online"}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
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

      <View style={styles.composer}>
        {processing ? (
          <Text style={styles.voiceStatus}>Transcribing…</Text>
        ) : listening ? (
          <Text style={styles.listeningStatus}>
            Listening… speak your message
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

        {!voiceError && !listening && !processing ? (
          <Text style={styles.hint}>
            Tap the mic to dictate — review the text, then send.
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  status: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
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
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  micButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  micButtonActive: {
    borderColor: "#f87171",
    backgroundColor: "#fef2f2",
  },
  micButtonDisabled: { opacity: 0.45 },
  micButtonPressed: { opacity: 0.85 },
  send: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.ink,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
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
    marginTop: 8,
    fontSize: 11,
    color: colors.inkFaint,
  },
});
