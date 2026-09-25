import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  ErrorText,
  Field,
  PageTitle,
  PrimaryButton,
} from "@/components/ui";
import { usePractice } from "@/lib/practiceContext";
import { createOverride, fetchOverrides } from "@/lib/procto";
import type { OverrideRow } from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { usePracticeLiveRefresh } from "@/lib/PracticeLiveContext";

const TYPES = [
  { value: "BLOCK_DAY", label: "Block day" },
  { value: "EMERGENCY_LEAVE", label: "Emergency leave" },
  { value: "BLOCK_SLOT", label: "Block hours" },
  { value: "TOKEN_LIMIT_ADJUST", label: "Token cap" },
] as const;

export default function OverridesScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, providerId, membership } = usePractice();
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [error, setError] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("BLOCK_DAY");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!practiceId) return;
    const res = await fetchOverrides(practiceId, providerId ?? undefined);
    if (res.status === "successful") {
      setRows((res.data as OverrideRow[]) ?? []);
      setError("");
    } else {
      setError(res.message || "Could not load overrides");
    }
  }, [practiceId, providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  usePracticeLiveRefresh(() => void load(), {
    bookings: false,
    ops: true,
  });

async function submit() {
    if (!practiceId || !providerId) {
      setError("No provider selected");
      return;
    }
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = {
      providerId,
      date,
      type,
      reason: reason.trim() || undefined,
    };
    if (type === "BLOCK_SLOT") {
      body.startTime = startTime;
      body.endTime = endTime;
    }
    if (type === "TOKEN_LIMIT_ADJUST") {
      body.maxTokens = Number(maxTokens) || 0;
    }
    const res = await createOverride(practiceId, body);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not create override");
      return;
    }
    setReason("");
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
        title="Manual overrides"
        subtitle="Block slots, emergency leave, or lower today's token capacity."
      />
      <ErrorText text={error} />

      <Text style={styles.section}>New override</Text>
      <View style={styles.chips}>
        {TYPES.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            active={type === t.value}
            onPress={() => setType(t.value)}
          />
        ))}
      </View>
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      {type === "BLOCK_SLOT" ? (
        <>
          <Field label="Start (HH:MM)" value={startTime} onChangeText={setStartTime} />
          <Field label="End (HH:MM)" value={endTime} onChangeText={setEndTime} />
        </>
      ) : null}
      {type === "TOKEN_LIMIT_ADJUST" ? (
        <Field
          label="Max tokens"
          value={maxTokens}
          onChangeText={setMaxTokens}
          keyboardType="number-pad"
        />
      ) : null}
      <Field
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="Festival / leave"
      />
      <PrimaryButton label="Apply override" onPress={submit} busy={busy} />

      <Text style={[styles.section, { marginTop: space.xl }]}>Recent</Text>
      {rows.length === 0 ? (
        <EmptyState text="No overrides yet." />
      ) : (
        rows.map((o) => (
          <View key={o.id} style={styles.card}>
            <Text style={styles.type}>{o.type.replace(/_/g, " ")}</Text>
            <Text style={styles.meta}>
              {String(o.date).slice(0, 10)}
              {o.maxTokens != null ? ` · max tokens ${o.maxTokens}` : ""}
              {o.startTime ? ` · ${o.startTime}–${o.endTime}` : ""}
            </Text>
            {o.reason ? <Text style={styles.reason}>{o.reason}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl },
  section: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkFaint,
    marginBottom: space.md,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radii.xl,
  },
  type: { fontSize: 15, fontWeight: "700", color: colors.ink },
  meta: { marginTop: space.xs, fontSize: 13, color: colors.inkSoft },
  reason: { marginTop: space.xs, fontSize: 13, color: colors.inkFaint },
});
