import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ErrorText,
  Field,
  HintText,
  PrimaryButton,
} from "@/components/ui";
import { api } from "@/lib/api";
import { colors, space } from "@/lib/theme";

type Props = {
  practiceId: string;
  bookingId: string;
  defaultAuthorName?: string;
  providerName?: string | null;
  onSubmitted?: () => void;
};

function StarRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.starBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
            <Text style={[styles.starBtn, value >= n && styles.starActive]}>
              ★
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function PracticeReviewForm({
  practiceId,
  bookingId,
  defaultAuthorName = "",
  providerName,
  onSubmitted,
}: Props) {
  const [authorName, setAuthorName] = useState(defaultAuthorName);
  const [rating, setRating] = useState(5);
  const [providerRating, setProviderRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await api(`/procto/practices/${practiceId}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        bookingId,
        authorName: authorName.trim() || undefined,
        rating,
        providerRating,
        body: body.trim() || undefined,
      }),
    });
    setBusy(false);
    if (res.status === "successful") {
      setMessage("Thanks! Your review appears on the clinic profile.");
      onSubmitted?.();
    } else {
      setError(res.message || "Could not submit review.");
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Rate your visit</Text>
      <Field
        label="Your name (optional)"
        value={authorName}
        onChangeText={setAuthorName}
        placeholder="How should we show your name?"
      />
      <StarRow label="Clinic" value={rating} onChange={setRating} />
      <StarRow
        label={providerName ? `Doctor · ${providerName}` : "Doctor"}
        value={providerRating}
        onChange={setProviderRating}
      />
      <Field
        label="Comment (optional)"
        value={body}
        onChangeText={setBody}
        placeholder="Share your experience"
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: "top" }}
      />
      <ErrorText text={error} />
      {message ? <HintText text={message} /> : null}
      <PrimaryButton
        label={busy ? "Submitting…" : "Submit review"}
        onPress={submit}
        busy={busy}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.sm },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: space.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
    marginBottom: 6,
  },
  starBlock: { marginBottom: space.md },
  stars: {
    flexDirection: "row",
    gap: 8,
  },
  starBtn: {
    fontSize: 28,
    color: colors.line,
  },
  starActive: {
    color: "#b45309",
  },
});
