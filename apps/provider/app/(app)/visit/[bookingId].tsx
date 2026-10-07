import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  Image,
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
import { ClinicalAssessmentPanel } from "@/components/ClinicalAssessmentPanel";
import {
  Chip,
  ErrorText,
  Loading,
  PrimaryButton,
  StatusBadge,
} from "@/components/ui";
import { uploadVisitFile } from "@/lib/cloudinary";
import {
  normalizeClinicalAssessment,
  type ClinicalAssessment,
} from "@/lib/clinicalMasters";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { resolveMediaUrl } from "@/lib/media";
import {
  fetchBooking,
  updateBookingStatus,
  updateVisit,
} from "@/lib/procto";
import { usePractice } from "@/lib/practiceContext";
import { getSessionUserId } from "@/lib/sessionUser";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { patchBookingFields } from "@/lib/liveBooking";
import {
  nextActions,
  whenLabel,
  type BookingRow,
  type VisitDocument,
} from "@/lib/types";
import { colors, radii, shadows, space } from "@/lib/theme";
import { contentBottomPad } from "@/lib/dockLayout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TIMES = ["morning", "afternoon", "evening", "night"] as const;
const INTERVAL_HOURS = [2, 4, 6, 8, 12] as const;
const MAX_INTERVAL_HOURS = 48;

function everyHoursLabel(hours: number) {
  return hours === 1 ? "Every 1 hour" : `Every ${hours} hours`;
}

function isDayPart(t: string) {
  return (TIMES as readonly string[]).includes(t);
}

type Med = { name: string; amount?: string; times?: string[] };

function dash(v: string | null | undefined) {
  return v?.trim() ? v : "—";
}

/** Optional patient fields: empty when we never collected the value. */
function blank(v: string | null | undefined) {
  return v?.trim() ? v.trim() : "";
}

function isAutoVisitBrief(text?: string | null): boolean {
  const t = text?.trim() || "";
  if (!t) return false;
  return (
    /^Chief complaint:/i.test(t) ||
    /^Patient problem:/i.test(t) ||
    /^Patient's description:/i.test(t) ||
    /AI brief for doctor:/i.test(t)
  );
}

function doctorRemarksForEdit(text?: string | null): string {
  if (!text?.trim() || isAutoVisitBrief(text)) return "";
  return text.trim();
}

function ageFromDob(dob?: string | null, age?: number | null): string {
  if (typeof age === "number" && age >= 0 && age <= 130) return String(age);
  if (!dob?.trim()) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let n = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) n -= 1;
  return n >= 0 && n <= 130 ? String(n) : "";
}

export default function VisitScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { membership } = usePractice();
  const {
    bookings: sharedBookings,
    bookingTick,
  } = usePracticeLive();
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [medicines, setMedicines] = useState<Med[]>([]);
  const [documents, setDocuments] = useState<VisitDocument[]>([]);
  const [clinicalAssessment, setClinicalAssessment] =
    useState<ClinicalAssessment | null>(null);
  const [medName, setMedName] = useState("");
  const [medAmount, setMedAmount] = useState("");
  const [medTimes, setMedTimes] = useState<string[]>([]);
  const [customHours, setCustomHours] = useState("");
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
      setRemarks(doctorRemarksForEdit(b.doctorRemarks));
      setMedicines(Array.isArray(b.medicines) ? b.medicines : []);
      setDocuments(Array.isArray(b.documents) ? b.documents : []);
      setClinicalAssessment(normalizeClinicalAssessment(b.clinicalAssessment));
    } else {
      if (Array.isArray(b.medicines)) setMedicines(b.medicines);
      if (Array.isArray(b.documents)) setDocuments(b.documents);
      // Keep local clinical edits — silent refresh must not wipe typing.
    }
    setError("");
  }, [bookingId]);

  useEffect(() => {
    void load();
    void getSessionUserId().then(setSelfId);
  }, [load]);


  const fromShared = sharedBookings.find((b) => b.id === bookingId) ?? null;

  useEffect(() => {
    if (!fromShared) return;
    setBooking((prev) => {
      if (!prev) return fromShared;
      return patchBookingFields(
        prev,
        fromShared as unknown as Record<string, unknown>,
      );
    });
  }, [fromShared]);

  useEffect(() => {
    if (bookingTick === 0) return;
    void load({ silent: true });
  }, [bookingTick, load]);

  const completed =
    String(booking?.status || "").toUpperCase() === "COMPLETED";
  const peerId = booking?.patientId || booking?.patient?.id || null;
  const patientName =
    booking?.patientName ||
    booking?.patient?.name ||
    booking?.patientPhone ||
    "Patient";
  const p = booking?.patient;

  async function persistMedicines(next: Med[]) {
    if (!bookingId || booking?.status === "COMPLETED") return
    setBusy(true)
    setError("")
    let docsToSave = documents
    if (docsToSave.length === 0) {
      const resFresh = await fetchBooking(bookingId)
      const serverDocs = Array.isArray(resFresh.data?.documents)
        ? (resFresh.data!.documents as VisitDocument[])
        : []
      if (serverDocs.length > 0) {
        docsToSave = serverDocs
        setDocuments(serverDocs)
      }
    }
    const res = await updateVisit(bookingId, {
      doctorRemarks: remarks,
      medicines: next,
      documents: docsToSave,
      clinicalAssessment: clinicalAssessment ?? null,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not save medicine")
      await load()
      return
    }
    await load({ silent: true })
  }


  function addMedicine() {
    const name = medName.trim();
    if (!name) return;
    const hours = Number(customHours);
    if (customHours && !(hours >= 1 && hours <= MAX_INTERVAL_HOURS)) {
      setError(`Custom timing must be every 1 to ${MAX_INTERVAL_HOURS} hours.`);
      return;
    }
    const next = [
      ...medicines,
      {
        name,
        amount: medAmount.trim() || undefined,
        times: medTimes.length ? [...medTimes] : undefined,
      },
    ];
    setMedicines(next);
    setMedName("");
    setMedAmount("");
    setMedTimes([]);
    setCustomHours("");
    void persistMedicines(next);
  }

  function removeMedicine(idx: number) {
    const next = medicines.filter((_, i) => i !== idx);
    setMedicines(next);
    void persistMedicines(next);
  }

  function toggleTime(t: string) {
    setCustomHours("");
    setMedTimes((prev) => {
      const parts = prev.filter(isDayPart);
      return parts.includes(t) ? parts.filter((x) => x !== t) : [...parts, t];
    });
  }

  function pickInterval(hours: number) {
    setCustomHours("");
    setMedTimes((prev) =>
      prev[0] === everyHoursLabel(hours) ? [] : [everyHoursLabel(hours)],
    );
  }

  function onCustomHours(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setCustomHours(digits);
    const n = Number(digits);
    if (n >= 1 && n <= MAX_INTERVAL_HOURS) setMedTimes([everyHoursLabel(n)]);
    else setMedTimes((prev) => prev.filter(isDayPart));
  }

  async function saveVisit(alsoStatus?: string) {
    if (!bookingId) return;
    setBusy(true);
    setError("");
    const res = await updateVisit(bookingId, {
      doctorRemarks: remarks,
      medicines,
      documents,
      clinicalAssessment: clinicalAssessment ?? null,
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
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") {
      setError("Completed appointments cannot change status.");
      return;
    }
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
      <View style={styles.stickyBanner}>
        <View style={styles.bannerHero}>
          <View style={styles.patientHeader}>
            {resolveMediaUrl(p?.imgSrc) ? (
              <Image
                source={{ uri: resolveMediaUrl(p?.imgSrc)! }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(patientName || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerEyebrow}>{whenLabel(booking)}</Text>
              <Text style={styles.bannerName}>{patientName}</Text>
              <Text style={styles.bannerSub}>
                {formatPhoneDisplay(
                  p?.contactNumber || p?.phone || booking.patientPhone,
                )}
                {" · "}
                Age {ageFromDob(p?.dateOfBirth)}
                {dash(p?.gender) !== "—" ? ` · ${dash(p?.gender)}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <StatusBadge status={booking.status} />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentBottomPad(insets.bottom, { fab: true }) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.banner}>
          <View style={styles.bannerFacts}>
            {blank(p?.dateOfBirth) ? (
              <Text style={styles.rowLabel}>
                Date of birth: {blank(p?.dateOfBirth)}
              </Text>
            ) : null}
            {ageFromDob(p?.dateOfBirth, p?.age) ? (
              <Text style={styles.rowLabel}>
                Age: {ageFromDob(p?.dateOfBirth, p?.age)}
              </Text>
            ) : null}
            {blank(p?.gender) ? (
              <Text style={styles.rowLabel}>Gender: {blank(p?.gender)}</Text>
            ) : null}
            {blank(p?.email) ? (
              <Text style={styles.rowLabel}>Email: {blank(p?.email)}</Text>
            ) : null}
            {blank(p?.contactNumber || p?.phone || booking.patientPhone) ? (
              <Text style={styles.rowLabel}>
                Phone:{" "}
                {formatPhoneDisplay(
                  p?.contactNumber || p?.phone || booking.patientPhone,
                  "",
                )}
              </Text>
            ) : null}
            {blank(p?.address) ? (
              <Text style={styles.rowLabel}>Address: {blank(p?.address)}</Text>
            ) : null}
            <View style={styles.divider} />
            {blank(booking.provider?.name) ? (
              <Text style={styles.rowLabel}>
                Doctor: {blank(booking.provider?.name)}
              </Text>
            ) : null}
            {booking.mode ? (
              <Text style={styles.rowLabel}>
                Mode: {booking.mode.replace(/_/g, " ")}
              </Text>
            ) : null}
            {booking.channel ? (
              <Text style={styles.rowLabel}>
                Channel: {booking.channel.replace(/_/g, " ")}
              </Text>
            ) : null}
            {booking.tokenNumber != null ? (
              <Text style={styles.rowLabel}>Token: #{booking.tokenNumber}</Text>
            ) : null}
            {booking.location ? (
              <Text style={styles.rowLabel}>
                Location:{" "}
                {[booking.location.name, booking.location.city]
                  .filter(Boolean)
                  .join(", ") || ""}
              </Text>
            ) : null}
            {booking.notes ? (
              <Text style={styles.notes}>
                Patient problem & AI brief:{"\n"}
                {booking.notes}
              </Text>
            ) : null}
          </View>
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

        <Text style={styles.section}>Vitals · Pain · Allergies</Text>
        <Text style={styles.lockedHint}>
          Capture vitals with color bands, pain rows, and allergies. Tap Save
          clinical below (or Save visit notes at the bottom).
        </Text>
        <ClinicalAssessmentPanel
          mastersRaw={
            membership?.practice.clinicalMasters ??
            booking.practice?.clinicalMasters
          }
          value={clinicalAssessment}
          readOnly={completed}
          onChange={setClinicalAssessment}
        />
        {!completed ? (
          <PrimaryButton
            label={busy ? "Saving…" : "Save clinical"}
            onPress={() => void saveVisit()}
            busy={busy}
            disabled={busy}
          />
        ) : null}

        <Text style={styles.section}>Remarks</Text>
        <Text style={styles.lockedHint}>
          Clinical remarks, advice, and follow-up for this visit.
        </Text>
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
              style={[styles.input, { marginTop: space.sm }]}
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
            <Text style={[styles.meta, { marginTop: space.sm }]}>Or every</Text>
            <View style={styles.actions}>
              {INTERVAL_HOURS.map((h) => (
                <Chip
                  key={h}
                  label={`${h} h`}
                  active={!customHours && medTimes[0] === everyHoursLabel(h)}
                  onPress={() => pickInterval(h)}
                />
              ))}
              <TextInput
                value={customHours}
                onChangeText={onCustomHours}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="Custom h"
                placeholderTextColor={colors.inkFaint}
                accessibilityLabel={`Custom interval in hours (1–${MAX_INTERVAL_HOURS})`}
                style={[styles.input, { width: 96, paddingVertical: 6, textAlign: "center" }]}
              />
            </View>
            {medTimes.length ? (
              <Text style={styles.meta}>Timing: {medTimes.join(", ")}</Text>
            ) : null}
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
                  onPress={() => removeMedicine(idx)}
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
              bookingId={booking.id}
              threadSince={booking.createdAt ?? booking.created_at ?? null}
            />
          ) : (
            <Text style={styles.hint}>
              Care chat needs a linked patient account. WhatsApp chats are in
              More → Patient Support.
            </Text>
          )
        ) : (
          <View style={styles.card}>
            {!completed ? (
              <View style={{ gap: space.sm, marginBottom: space.md }}>
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
          <View style={{ gap: space.md, marginTop: space.lg }}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  rootPad: { flex: 1, padding: space.xl, backgroundColor: colors.paper },
  content: { padding: space.xl },
  stickyBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    zIndex: 20,
    ...shadows.soft,
  },
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    marginBottom: space.lg,
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadows.soft,
  },
  bannerHero: {
    backgroundColor: colors.brandLight,
    padding: space.lg,
  },
  bannerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: space.xs,
  },
  bannerName: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  bannerSub: {
    marginTop: space.xs,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  bannerFacts: {
    padding: space.lg,
  },
  statusRow: { marginTop: space.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    marginBottom: space.md,
    borderRadius: radii.xl,
  },
  patientHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.line,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandLight,
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.brand,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
    marginVertical: space.md,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.ink,
    marginBottom: space.sm,
    lineHeight: 20,
  },
  notes: {
    marginTop: space.xs,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.md,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  lockedHint: {
    width: "100%",
    marginTop: space.xs,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  section: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
    marginBottom: space.sm,
    marginTop: space.lg,
  },
  area: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 120,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: "top",
    marginBottom: space.md,
    borderRadius: radii.md,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.ink,
    borderRadius: radii.md,
  },
  readonly: { opacity: 0.75 },
  hint: { fontSize: 13, color: colors.inkFaint, marginBottom: space.md },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radii.lg,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  medName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  meta: { marginTop: 2, fontSize: 12, color: colors.inkSoft },
});
