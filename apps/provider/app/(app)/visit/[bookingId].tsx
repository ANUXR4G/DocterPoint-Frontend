import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CareChatPanel } from "@/components/CareChatPanel";
import {
  Chip,
  ErrorText,
  Loading,
  PageTitle,
  PrimaryButton,
  StatusBadge,
} from "@/components/ui";
import { uploadVisitFile } from "@/lib/cloudinary";
import {
  fetchBooking,
  updateBookingStatus,
  updateVisit,
} from "@/lib/procto";
import { getSessionUserId } from "@/lib/sessionUser";
import { usePractice } from "@/lib/practiceContext";
import { useProctoLiveSocket } from "@/hooks/useLiveSocket";
import { patchBookingFields } from "@/lib/liveBooking";
import {
  nextActions,
  whenLabel,
  type BookingRow,
  type VisitDocument,
} from "@/lib/types";
import { colors, space } from "@/lib/theme";

const TIMES = ["morning", "afternoon", "evening", "night"] as const;

type Med = { name: string; amount?: string; times?: string[] };

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—";
}

function ageFromDob(dob?: string | null): string {
  if (!dob?.trim()) return "—";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? String(age) : "—";
}

export default function VisitScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { practiceId } = usePractice();
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [medicines, setMedicines] = useState<Med[]>([]);
  const [documents, setDocuments] = useState<VisitDocument[]>([]);
  const [medName, setMedName] = useState("");
  const [medAmount, setMedAmount] = useState("");
  const [medTimes, setMedTimes] = useState<string[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"chat" | "documents">("chat");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!bookingId) return;
    const res = await fetchBooking(bookingId);
    if (res.status !== "successful" || !res.data) {
      if (!opts?.silent) {
        setError(res.message || "Visit not found");
        setBooking(null);
      }
      return;
    }
    const b = res.data as BookingRow;
    setBooking(b);
    if (!opts?.silent) {
      setRemarks(b.doctorRemarks || "");
      setMedicines(Array.isArray(b.medicines) ? b.medicines : []);
      setDocuments(Array.isArray(b.documents) ? b.documents : []);
    } else {
      if (Array.isArray(b.medicines)) setMedicines(b.medicines);
      if (Array.isArray(b.documents)) setDocuments(b.documents);
    }
    setError("");
  }, [bookingId]);

  useEffect(() => {
    void load();
    void getSessionUserId().then(setSelfId);
  }, [load]);

  useProctoLiveSocket(
    practiceId,
    (event) => {
      if (
        !event ||
        typeof event !== "object" ||
        !("event" in event) ||
        (event.event !== "booking_created" &&
          event.event !== "booking_updated")
      ) {
        return;
      }
      const incoming =
        "booking" in event
          ? (event.booking as Record<string, unknown>)
          : undefined;
      if (!incoming?.id || String(incoming.id) !== String(bookingId)) return;
      setBooking((prev) =>
        prev ? patchBookingFields(prev, incoming) : prev,
      );
      if (
        incoming.doctor_remarks !== undefined ||
        incoming.doctorRemarks !== undefined ||
        incoming.medicines !== undefined ||
        incoming.documents !== undefined
      ) {
        void load({ silent: true });
      }
    },
    () => void load({ silent: true }),
  );

  const completed =
    String(booking?.status || "").toUpperCase() === "COMPLETED";
  const peerId = booking?.patientId || booking?.patient?.id || null;
  const patientName =
    booking?.patientName ||
    booking?.patient?.name ||
    booking?.patientPhone ||
    "Patient";
  const p = booking?.patient;

  function addMedicine() {
    const name = medName.trim();
    if (!name) return;
    setMedicines((prev) => [
      ...prev,
      {
        name,
        amount: medAmount.trim() || undefined,
        times: medTimes.length ? [...medTimes] : undefined,
      },
    ]);
    setMedName("");
    setMedAmount("");
    setMedTimes([]);
  }

  function toggleTime(t: string) {
    setMedTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function saveVisit(alsoStatus?: string) {
    if (!bookingId) return;
    setBusy(true);
    setError("");
    const res = await updateVisit(bookingId, {
      doctorRemarks: remarks,
      medicines,
      documents,
      ...(alsoStatus ? { status: alsoStatus } : {}),
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Save failed");
      return;
    }
    await load();
  }

  async function setStatus(status: string) {
    if (!bookingId) return;
    setBusy(true);
    const res = await updateBookingStatus(bookingId, status);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    await load();
  }

  async function attachFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission is required.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    await uploadAsset({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
  }

  async function attachDocument() {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    await uploadAsset({
      uri: asset.uri,
      name: asset.name || `document-${Date.now()}`,
      mimeType: asset.mimeType,
    });
  }

  async function uploadAsset(file: {
    uri: string;
    name: string;
    mimeType?: string | null;
  }) {
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadVisitFile(file);
      setDocuments((prev) => [
        ...prev,
        {
          name: file.name || uploaded.original_filename || "Document",
          url: uploaded.secure_url,
          uploadedAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setError("Could not upload document.");
    } finally {
      setUploading(false);
    }
  }

  if (!booking && !error) return <Loading />;

  if (!booking) {
    return (
      <View style={styles.rootPad}>
        <ErrorText text={error || "Visit not found"} />
        <PrimaryButton label="Back" onPress={() => router.back()} tone="ghost" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <PageTitle
          eyebrow={whenLabel(booking)}
          title={patientName}
          subtitle={booking.patientPhone}
        />

        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} />
        </View>

        <View style={styles.card}>
          <Text style={styles.snapshotTitle}>Patient</Text>
          <Text style={styles.rowLabel}>Age: {ageFromDob(p?.dateOfBirth)}</Text>
          <Text style={styles.rowLabel}>Gender: {dash(p?.gender)}</Text>
          <Text style={styles.rowLabel}>Email: {dash(p?.email)}</Text>
          <Text style={styles.rowLabel}>
            Phone: {dash(p?.contactNumber || p?.phone || booking.patientPhone)}
          </Text>
          <Text style={styles.rowLabel}>Profession: {dash(p?.profession)}</Text>
          <Text style={styles.rowLabel}>Address: {dash(p?.address)}</Text>
          <View style={styles.divider} />
          <Text style={styles.rowLabel}>
            Disease: {booking.disease || booking.consultationType || "—"}
          </Text>
          <Text style={styles.rowLabel}>
            Mode: {booking.mode?.replace(/_/g, " ") || "—"}
          </Text>
          <Text style={styles.rowLabel}>
            Channel: {booking.channel?.replace(/_/g, " ") || "—"}
          </Text>
          {booking.tokenNumber != null ? (
            <Text style={styles.rowLabel}>Token: #{booking.tokenNumber}</Text>
          ) : null}
          {booking.location ? (
            <Text style={styles.rowLabel}>
              Location:{" "}
              {[booking.location.name, booking.location.city]
                .filter(Boolean)
                .join(", ") || "—"}
            </Text>
          ) : null}
          {booking.notes ? (
            <Text style={styles.notes}>Patient notes: {booking.notes}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {nextActions(booking.status).map((s) => (
            <Chip
              key={s.status}
              label={s.label}
              onPress={busy ? undefined : () => void setStatus(s.status)}
            />
          ))}
          {completed ? (
            <Text style={styles.lockedHint}>
              Finished — cannot cancel or reschedule.
            </Text>
          ) : null}
        </View>

        <Text style={styles.section}>Remarks for patient</Text>
        <TextInput
          value={remarks}
          onChangeText={setRemarks}
          editable={!completed}
          multiline
          placeholder="Clinical remarks, advice, follow-up…"
          placeholderTextColor={colors.inkFaint}
          style={[styles.area, completed && styles.readonly]}
        />

        <Text style={styles.section}>Medicines</Text>
        {!completed ? (
          <View style={styles.card}>
            <TextInput
              value={medName}
              onChangeText={setMedName}
              placeholder="Medicine name"
              placeholderTextColor={colors.inkFaint}
              style={styles.input}
            />
            <TextInput
              value={medAmount}
              onChangeText={setMedAmount}
              placeholder="Dose"
              placeholderTextColor={colors.inkFaint}
              style={[styles.input, { marginTop: 8 }]}
            />
            <View style={styles.actions}>
              {TIMES.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={medTimes.includes(t)}
                  onPress={() => toggleTime(t)}
                />
              ))}
            </View>
            <PrimaryButton label="Add medicine" onPress={addMedicine} />
          </View>
        ) : null}

        {medicines.length === 0 ? (
          <Text style={styles.hint}>No medicines yet.</Text>
        ) : (
          medicines.map((m, idx) => (
            <View key={`${m.name}-${idx}`} style={styles.medRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.medName}>{m.name}</Text>
                <Text style={styles.meta}>
                  {m.amount || "—"}
                  {m.times?.length ? ` · ${m.times.join(", ")}` : ""}
                </Text>
              </View>
              {!completed ? (
                <Chip
                  label="Remove"
                  onPress={() =>
                    setMedicines((prev) => prev.filter((_, i) => i !== idx))
                  }
                />
              ) : null}
            </View>
          ))
        )}

        <View style={styles.tabRow}>
          <Chip
            label="Chat"
            active={sideTab === "chat"}
            onPress={() => setSideTab("chat")}
          />
          <Chip
            label={`Documents${documents.length ? ` (${documents.length})` : ""}`}
            active={sideTab === "documents"}
            onPress={() => setSideTab("documents")}
          />
        </View>

        {sideTab === "chat" ? (
          selfId && peerId ? (
            <CareChatPanel
              selfUserId={selfId}
              peerUserId={peerId}
              peerName={patientName}
            />
          ) : (
            <Text style={styles.hint}>
              Care chat needs a linked patient account. WhatsApp inbox is under
              More.
            </Text>
          )
        ) : (
          <View style={styles.card}>
            {!completed ? (
              <View style={{ gap: 8, marginBottom: space.md }}>
                <PrimaryButton
                  label={uploading ? "Uploading…" : "Add photo"}
                  onPress={() => void attachFromLibrary()}
                  busy={uploading}
                />
                <PrimaryButton
                  label="Add file"
                  onPress={() => void attachDocument()}
                  busy={uploading}
                  tone="ghost"
                />
              </View>
            ) : null}
            {documents.length === 0 ? (
              <Text style={styles.hint}>
                {completed ? "No documents attached." : "No documents yet."}
              </Text>
            ) : (
              documents.map((d, idx) => (
                <View key={`${d.url}-${idx}`} style={styles.docRow}>
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => void Linking.openURL(d.url)}
                  >
                    <Text style={styles.medName} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text style={styles.meta}>Tap to open</Text>
                  </Pressable>
                  {!completed ? (
                    <Chip
                      label="Remove"
                      onPress={() =>
                        setDocuments((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                    />
                  ) : null}
                </View>
              ))
            )}
          </View>
        )}

        <ErrorText text={error} />

        {!completed ? (
          <View style={{ gap: 10, marginTop: space.md }}>
            <PrimaryButton
              label="Save visit notes"
              onPress={() => void saveVisit()}
              busy={busy}
            />
            <PrimaryButton
              label="Save & finish"
              onPress={() => void saveVisit("COMPLETED")}
              busy={busy}
            />
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  rootPad: { flex: 1, padding: space.xl, backgroundColor: colors.paper },
  content: { padding: space.xl, paddingBottom: 48 },
  statusRow: { marginBottom: space.md },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
  },
  snapshotTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 10,
  },
  rowLabel: { fontSize: 14, color: colors.ink, marginBottom: 6 },
  notes: { marginTop: 4, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", marginBottom: space.md },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  lockedHint: {
    width: "100%",
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  section: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: space.sm,
    marginTop: space.sm,
  },
  area: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
    padding: 12,
    minHeight: 120,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: "top",
    marginBottom: space.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  readonly: { opacity: 0.75 },
  hint: { fontSize: 13, color: colors.inkFaint, marginBottom: space.md },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
    padding: space.md,
    marginBottom: 8,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  medName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 2, fontSize: 12, color: colors.inkSoft },
});
