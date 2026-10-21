import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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

export function PracticeReviewForm({
  practiceId,
  bookingId,
  defaultAuthorName = "",
  onSubmitted,
}: Props) {
  const [authorName, setAuthorName] = useState(defaultAuthorName);
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
        rating: 5,
        providerRating: 5,
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
      <Text style={styles.label}>Your review</Text>
      <Field
        label="Your name (optional)"
        value={authorName}
        onChangeText={setAuthorName}
        placeholder="How should we show your name?"
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
});
