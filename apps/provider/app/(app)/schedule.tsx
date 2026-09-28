import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
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
import {
  fetchSchedules,
  fetchOverrides,
  upsertSchedule,
  createOverride,
  saveProviderSettings,
} from "@/lib/procto";
import { DAY_LABELS, type OverrideRow, type ScheduleRow } from "@/lib/types";
import { colors, radii, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { usePracticeLiveRefresh } from "@/lib/PracticeLiveContext";

const TYPES = [
  { value: "BLOCK_DAY", label: "Block day" },
  { value: "EMERGENCY_LEAVE", label: "Leave" },
  { value: "TOKEN_LIMIT_ADJUST", label: "Token cap" },
  { value: "BLOCK_SLOT", label: "Block slot" },
] as const;

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { practiceId, providerId, membership } = usePractice();
  const [pane, setPane] = useState<"hours" | "blocks">("hours");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [bookingType, setBookingType] = useState<"TIME" | "TOKEN">("TIME");
  const [pendingNote, setPendingNote] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("BLOCK_DAY");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotEnd, setSlotEnd] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editMax, setEditMax] = useState("");

  const load = useCallback(async () => {
    if (!practiceId) return;
    const [sRes, oRes] = await Promise.all([
      fetchSchedules(practiceId, providerId ?? undefined),
      fetchOverrides(practiceId, providerId ?? undefined),
    ]);
    if (sRes.status === "successful") {
      const list = (sRes.data as ScheduleRow[]) ?? [];
      setRows(list);
      const first = list[0];
      if (first) {
        setBookingType(first.mode === "TOKEN_BASED" ? "TOKEN" : "TIME");
      }
      const pending = (
        sRes as {
          pendingModeChange?: {
            toMode: string;
            effectiveDate: string;
          } | null;
        }
      ).pendingModeChange;
      if (pending) {
        setPendingNote(
          `Switch to ${
            pending.toMode === "TOKEN_BASED" ? "Token queue" : "Time slots"
          } applies ${pending.effectiveDate}.`,
        );
      } else setPendingNote("");
    }
    if (oRes.status === "successful")
      setOverrides((oRes.data as OverrideRow[]) ?? []);
    if (sRes.status !== "successful" && oRes.status !== "successful") {
      setError(sRes.message || oRes.message || "Could not load schedule");
    } else setError("");
  }, [practiceId, providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  usePracticeLiveRefresh(() => void load(), {
    bookings: false,
    ops: true,
  });

  async function switchBookingType(next: "TIME" | "TOKEN") {
    if (!practiceId || !providerId || next === bookingType) {
      return;
    }
    const fromLabel = bookingType === "TOKEN" ? "Token queue" : "Time slots";
    const toLabel = next === "TOKEN" ? "Token queue" : "Time slots";
    Alert.alert(
      "Confirm booking type change",
      `Switch from ${fromLabel} to ${toLabel}?\n\nAfter you confirm, the new type takes effect from tomorrow. Today's appointments keep ${fromLabel}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "default",
          onPress: () => void applyBookingType(next),
        },
      ],
    );
  }

  async function applyBookingType(next: "TIME" | "TOKEN") {
    if (!practiceId || !providerId) return;
    const seed = rows[0];
    const locationId =
      seed?.locationId ||
      seed?.location?.id ||
      membership?.practice.locations[0]?.id;
    if (!locationId) {
      setError("Missing location — cannot switch booking type.");
      return;
    }
    const workingDays = [
      ...new Set(rows.map((r) => r.dayOfWeek)),
    ].sort((a, b) => a - b);
    const start =
      seed?.startTime || seed?.sessionStart || "09:00";
    const end = seed?.endTime || seed?.sessionEnd || "17:00";
    setBusy(true);
    setError("");
    setInfo("");
    const res = await saveProviderSettings(practiceId, {
      providerId,
      locationId,
      bookingType: next,
      workingDays: workingDays.length ? workingDays : [1, 2, 3, 4, 5],
      startTime: start,
      endTime: end,
      breakStartTime: seed?.breakStartTime || undefined,
      breakEndTime: seed?.breakEndTime || undefined,
      slotDurationMins: seed?.slotIntervalMin || 15,
      patientsPerSlot: seed?.maxPerSlot || 1,
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not switch booking type");
      await load();
      return;
    }
    setBookingType(next);
    const payload = res.data as { message?: string } | null;
    setInfo(
      payload?.message ||
        "Booking type switch confirmed — it takes effect tomorrow.",
    );
    await load();
  }

function beginEdit(s: ScheduleRow) {
    setEditId(s.id);
    if (s.mode === "TOKEN_BASED") {
      setEditStart(s.sessionStart || "");
      setEditEnd(s.sessionEnd || "");
      setEditMax(String(s.maxTokens ?? ""));
    } else {
      setEditStart(s.startTime || "");
      setEditEnd(s.endTime || "");
      setEditMax(String(s.maxPerSlot ?? 1));
    }
  }

  async function saveHours(s: ScheduleRow) {
    if (!practiceId || !providerId) {
      setError("No provider selected");
      return;
    }
    const locationId = s.locationId || s.location?.id;
    if (!locationId) {
      setError("Missing location on this schedule row.");
      return;
    }
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = {
      providerId,
      locationId,
      dayOfWeek: s.dayOfWeek,
      mode: s.mode,
    };
    if (s.mode === "TOKEN_BASED") {
      body.sessionStart = editStart.trim();
      body.sessionEnd = editEnd.trim();
      body.maxTokens = Number(editMax) || s.maxTokens || 20;
    } else {
      body.startTime = editStart.trim();
      body.endTime = editEnd.trim();
      body.slotIntervalMin = s.slotIntervalMin ?? 15;
      body.maxPerSlot = Number(editMax) || s.maxPerSlot || 1;
    }
    const res = await upsertSchedule(practiceId, body);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not save hours");
      return;
    }
    const saved = res.data as {
      status?: string;
      impact?: { total?: number };
      message?: string | null;
    } | null;
    const noticeText = saved?.message ? ` ${saved.message}` : "";
    if (saved?.status === "PENDING_VERIFICATION") {
      const n = saved.impact?.total ?? 0;
      setInfo(
        `Saved as Pending verification: the new hours clash with ${n} booked appointment${n === 1 ? "" : "s"}. The current hours stay in force until the clinic activates the change in the web portal (Settings → Account).${noticeText}`,
      );
    } else if (noticeText) {
      setInfo(noticeText.trim());
    }
    setEditId(null);
    await load();
  }

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
    if (type === "TOKEN_LIMIT_ADJUST") {
      body.maxTokens = Number(maxTokens) || 0;
    }
    if (type === "BLOCK_SLOT") {
      body.startTime = slotStart.trim();
      body.endTime = slotEnd.trim();
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
        title="Hours & blocks"
        subtitle="Edit weekly hours and apply day blocks — same as practice settings."
      />
      <View style={styles.chips}>
        <Chip
          label="Weekly hours"
          active={pane === "hours"}
          onPress={() => setPane("hours")}
        />
        <Chip
          label="Block / leave"
          active={pane === "blocks"}
          onPress={() => setPane("blocks")}
        />
      </View>
      <ErrorText text={error} />

      {pane === "hours" ? (
        <>
          <Text style={styles.sectionLabel}>Booking type (this doctor)</Text>
          <View style={styles.chips}>
            <Chip
              label="Time slots"
              active={bookingType === "TIME"}
              onPress={() => void switchBookingType("TIME")}
            />
            <Chip
              label="Token queue"
              active={bookingType === "TOKEN"}
              onPress={() => void switchBookingType("TOKEN")}
            />
          </View>
          {pendingNote ? (
            <Text style={styles.pending}>{pendingNote}</Text>
          ) : (
            <Text style={styles.hint}>
              Tap to switch — confirm in the dialog. Change takes effect
              tomorrow.
            </Text>
          )}
          {info ? <Text style={styles.pending}>{info}</Text> : null}
        {rows.length === 0 ? (
          <EmptyState text="No weekly hours configured yet." />
        ) : (
          rows.map((s) => (
            <View key={s.id} style={styles.card}>
              <Text style={styles.day}>
                {DAY_LABELS[s.dayOfWeek] ?? `Day ${s.dayOfWeek}`}
              </Text>
              <Text style={styles.mode}>
                {s.mode === "TOKEN_BASED" ? "Token session" : "Time slots"}
              </Text>
              {editId === s.id ? (
                <>
                  <Field
                    label={
                      s.mode === "TOKEN_BASED"
                        ? "Session start (HH:MM)"
                        : "Start (HH:MM)"
                    }
                    value={editStart}
                    onChangeText={setEditStart}
                  />
                  <Field
                    label={
                      s.mode === "TOKEN_BASED"
                        ? "Session end (HH:MM)"
                        : "End (HH:MM)"
                    }
                    value={editEnd}
                    onChangeText={setEditEnd}
                  />
                  <Field
                    label={
                      s.mode === "TOKEN_BASED" ? "Max tokens" : "Max per slot"
                    }
                    value={editMax}
                    onChangeText={setEditMax}
                    keyboardType="number-pad"
                  />
                  <View style={styles.chips}>
                    <PrimaryButton
                      label="Save"
                      onPress={() => void saveHours(s)}
                      busy={busy}
                    />
                    <Chip label="Cancel" onPress={() => setEditId(null)} />
                  </View>
                </>
              ) : (
                <>
                  {s.mode === "TOKEN_BASED" ? (
                    <Text style={styles.meta}>
                      {s.sessionStart}–{s.sessionEnd} · max {s.maxTokens ?? "?"}{" "}
                      tokens
                    </Text>
                  ) : (
                    <Text style={styles.meta}>
                      {s.startTime}–{s.endTime} · every{" "}
                      {s.slotIntervalMin ?? 30} min · up to {s.maxPerSlot ?? 1}{" "}
                      / slot
                    </Text>
                  )}
                  <View style={{ marginTop: space.sm }}>
                    <Chip label="Edit" onPress={() => beginEdit(s)} />
                  </View>
                </>
              )}
            </View>
          ))
        )}
        </>
      ) : (
        <>
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
          {type === "TOKEN_LIMIT_ADJUST" ? (
            <Field
              label="Max tokens"
              value={maxTokens}
              onChangeText={setMaxTokens}
              keyboardType="number-pad"
            />
          ) : null}
          {type === "BLOCK_SLOT" ? (
            <>
              <Field
                label="Slot start (HH:MM)"
                value={slotStart}
                onChangeText={setSlotStart}
              />
              <Field
                label="Slot end (HH:MM)"
                value={slotEnd}
                onChangeText={setSlotEnd}
              />
            </>
          ) : null}
          <Field
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
          />
          <PrimaryButton label="Apply" onPress={submit} busy={busy} />
          <Text style={styles.section}>Recent overrides</Text>
          {overrides.length === 0 ? (
            <EmptyState text="No overrides yet." />
          ) : (
            overrides.map((o) => (
              <View key={o.id} style={styles.card}>
                <Text style={styles.day}>{o.type.replace(/_/g, " ")}</Text>
                <Text style={styles.meta}>{String(o.date).slice(0, 10)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.xl },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  section: {
    marginTop: space.xl,
    marginBottom: space.md,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radii.xl,
  },
  day: { fontSize: 16, fontWeight: "700", color: colors.ink },
  mode: {
    marginTop: space.xs,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.brand,
  },
  meta: {
    marginTop: space.sm,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  sectionLabel: {
    marginBottom: space.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  hint: {
    marginBottom: space.md,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  pending: {
    marginBottom: space.md,
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
    lineHeight: 18,
  },
});
