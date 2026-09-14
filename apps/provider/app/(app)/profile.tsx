import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Chip, EmptyState, PageTitle, PrimaryButton } from "@/components/ui";
import { PremiumAtmosphere } from "@/components/mobile/PremiumChrome";
import { clearSession } from "@/lib/api";
import { usePractice, usePracticeLabel } from "@/lib/practiceContext";
import { fetchConversations, setConversationStatus } from "@/lib/procto";
import { doctorWebPath } from "@/lib/webPortal";
import { colors, radii, space } from "@/lib/theme";
import { dockClearance } from "@/lib/dockLayout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Conv = {
  id: string;
  patientPhone: string;
  status: string;
  updatedAt: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    memberships,
    membership,
    practiceId,
    practiceIndex,
    setPracticeIndex,
  } = usePractice();
  const label = usePracticeLabel(membership);
  const [pane, setPane] = useState<"info" | "whatsapp">("info");
  const [rows, setRows] = useState<Conv[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    if (!practiceId) return;
    const res = await fetchConversations(practiceId);
    if (res.status === "successful") setRows((res.data as Conv[]) ?? []);
  }, [practiceId]);

  useEffect(() => {
    if (pane === "whatsapp") void loadInbox();
  }, [pane, loadInbox]);

  async function signOut() {
    await clearSession();
    router.replace("/(auth)/login");
  }

  async function setStatus(
    id: string,
    status: "bot_active" | "handed_off" | "closed",
  ) {
    if (!practiceId) return;
    setBusyId(id);
    await setConversationStatus(practiceId, id, status);
    setBusyId(null);
    await loadInbox();
  }

  function openWeb(path: string) {
    void Linking.openURL(doctorWebPath(path));
  }

  return (
    <View style={styles.root}>
      <PremiumAtmosphere />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.lg,
            paddingBottom: dockClearance + 24,
          },
        ]}
      >
      <PageTitle
        eyebrow="Doctor"
        title={membership?.practice.name ?? "No practice"}
        subtitle={label}
      />

      <View style={styles.chips}>
        <Chip
          label="Dashboard"
          active={pane === "info"}
          onPress={() => setPane("info")}
        />
        <Chip
          label="WhatsApp inbox"
          active={pane === "whatsapp"}
          onPress={() => setPane("whatsapp")}
        />
      </View>

      {memberships.length > 1 ? (
        <View style={{ marginBottom: space.lg }}>
          <Text style={styles.section}>Switch practice</Text>
          <View style={styles.chips}>
            {memberships.map((m, i) => (
              <Chip
                key={m.practice.id}
                label={m.practice.name}
                active={i === practiceIndex}
                onPress={() => setPracticeIndex(i)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {pane === "info" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.row}>
              Type: {membership?.practice.type ?? "—"}
            </Text>
            <Text style={styles.row}>
              Specialty: {membership?.practice.specialty ?? "—"}
            </Text>
            <Text style={styles.row}>
              Location:{" "}
              {membership?.practice.locations[0]
                ? `${membership.practice.locations[0].name}, ${membership.practice.locations[0].city}`
                : "—"}
            </Text>
          </View>

          <Text style={styles.section}>Day tools</Text>
          <View style={styles.chips}>
            <Chip
              label="Appointments list"
              onPress={() => router.push("/(app)/appointments")}
            />
            <Chip label="Hours & blocks" onPress={() => router.push("/(app)/schedule")} />
            <Chip label="Plans & billing" onPress={() => router.push("/(app)/subscriptions")} />
            <Chip label="WhatsApp inbox" onPress={() => router.push("/(app)/inbox")} />
            <Chip label="Help (Mira)" onPress={() => router.push("/(app)/queries")} />
          </View>

          <Text style={styles.section}>On the web portal</Text>
          <Text style={styles.hint}>
            Team roster, practice profile, and theme stay on the web (same
            doctor login).
          </Text>
          <View style={styles.chips}>
            <Chip
              label="Practice settings"
              onPress={() => openWeb("/settings?tab=practice")}
            />
            <Chip
              label="Manage doctors"
              onPress={() => openWeb("/settings?tab=practice&subtab=doctors")}
            />
            <Chip
              label="Web dashboard"
              onPress={() => openWeb("/doctor/dashboard")}
            />
          </View>
        </>
      ) : rows.length === 0 ? (
        <EmptyState text="No WhatsApp conversations yet." />
      ) : (
        rows.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.phone}>{c.patientPhone}</Text>
            <Text style={styles.meta}>
              {c.status} · {new Date(c.updatedAt).toLocaleString()}
            </Text>
            <View style={styles.chips}>
              <Chip
                label="Take over"
                active={c.status === "handed_off"}
                onPress={
                  busyId === c.id
                    ? undefined
                    : () => void setStatus(c.id, "handed_off")
                }
              />
              <Chip
                label="Bot"
                active={c.status === "bot_active"}
                onPress={
                  busyId === c.id
                    ? undefined
                    : () => void setStatus(c.id, "bot_active")
                }
              />
            </View>
          </View>
        ))
      )}

      <PrimaryButton label="Sign out" onPress={signOut} tone="danger" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.xl },
  section: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: space.sm,
    marginTop: space.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    marginBottom: space.md,
  },
  row: { fontSize: 14, color: colors.ink, marginBottom: 6 },
  hint: {
    marginBottom: space.md,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  phone: { fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: { marginTop: 4, fontSize: 12, color: colors.inkSoft, marginBottom: 8 },
});
