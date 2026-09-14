import { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { colors, space } from "@/lib/theme";

type VoiceFieldProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  micAriaLabel?: string;
};

function MicIcon({ active }: { active: boolean }) {
  return (
    <Ionicons
      name={active ? "stop" : "mic"}
      size={18}
      color={active ? "#dc2626" : colors.ink}
    />
  );
}

export function VoiceField({
  label,
  value,
  onChangeText,
  micAriaLabel = "Record by voice",
  editable = true,
  ...props
}: VoiceFieldProps) {
  const baseRef = useRef("");

  const {
    listening,
    processing,
    error: voiceError,
    toggle,
    clearError,
  } = useSpeechRecognition({
    continuous: true,
    liveTranscript: true,
    onInterimTranscript: (text) => {
      const base = baseRef.current;
      onChangeText(base ? `${base} ${text}` : text);
    },
    onFinalTranscript: (text) => {
      if (!text) return;
      const base = baseRef.current.trim();
      const merged = base ? `${base} ${text}` : text;
      baseRef.current = merged;
      onChangeText(merged);
    },
  });

  function handleChangeText(text: string) {
    clearError();
    baseRef.current = text;
    onChangeText(text);
  }

  function handleMicPress() {
    if (!editable) return;
    clearError();
    if (!listening) baseRef.current = value.trim();
    toggle();
  }

  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          placeholderTextColor={colors.inkFaint}
          style={[
            styles.input,
            styles.inputFlex,
            editable === false && styles.inputDisabled,
          ]}
          value={value}
          onChangeText={handleChangeText}
          editable={editable && !listening}
          multiline
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? "Stop voice input" : micAriaLabel}
          onPress={handleMicPress}
          disabled={!editable || processing}
          style={({ pressed }) => [
            styles.micButton,
            listening && styles.micButtonActive,
            pressed && styles.micButtonPressed,
            !editable && styles.micButtonDisabled,
          ]}
        >
          <MicIcon active={listening} />
        </Pressable>
      </View>
      {listening ? (
        <Text style={styles.listening}>Listening… text appears as you speak</Text>
      ) : null}
      {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
      {!listening && !voiceError ? (
        <Text style={styles.hint}>Tap the mic — words appear live. Tap again to stop.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  input: {
    borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: colors.ink,
  backgroundColor: colors.paperRaised,
    minHeight: 48,
  },
  inputFlex: {
    flex: 1,
  },
  inputDisabled: {
    opacity: 0.7,
  },
  micButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paperRaised,
  },
  micButtonActive: {
    borderColor: "#f87171",
    backgroundColor: "#fef2f2",
  },
  micButtonPressed: {
    opacity: 0.85,
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  listening: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626",
  },
  voiceError: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: colors.inkFaint,
  },
});
