import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CareChatPanel } from "@/components/CareChatPanel";
import { RxButton } from "@/components/ClinicLogSheet";
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
  addGeneralDocument,
  fetchBooking,
  fetchGeneralDocuments,
  updateBookingStatus,
  sendClinicLogWhatsApp,
  updateVisit,
} from "@/lib/procto";
import { usePractice } from "@/lib/practiceContext";
import { getSessionUserId } from "@/lib/sessionUser";
import { usePracticeLive } from "@/lib/PracticeLiveContext";
import { patchBookingFields } from "@/lib/liveBooking";
import {
  nextActions,
  bookingDoctorName,
  whenLabel,
  type BookingRow,
  type VisitDocument,
} from "@/lib/types";
import { isAfterClinicToday } from "@/lib/practiceTime";
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

type Med = {
  name: string;
  amount?: string;
  times?: string[];
  strength?: string;
  route?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  instruction?: string;
  startDate?: string;
  endDate?: string;
  favourite?: boolean;
};

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
  const [sendingWa, setSendingWa] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [complaint, setComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const diagnosisRef = useRef("");
  const adviceRef = useRef("");
  const [medicines, setMedicines] = useState<Med[]>([]);
  const [documents, setDocuments] = useState<VisitDocument[]>([]);
  const [clinicalAssessment, setClinicalAssessment] =
    useState<ClinicalAssessment | null>(null);
  const clinicalReady = useRef(false);
  const clinicalDirty = useRef(false);
  const clinicalRef = useRef<ClinicalAssessment | null>(null);
  const documentsRef = useRef<VisitDocument[]>([]);
  const uploadingRef = useRef(false);
  const loadSeq = useRef(0);
  const [chartReady, setChartReady] = useState(false);
  const [medName, setMedName] = useState("");
  const [medAmount, setMedAmount] = useState("");
  const [medTimes, setMedTimes] = useState<string[]>([]);
  const [customHours, setCustomHours] = useState("");
  const [selfId, setSelfId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"chat" | "documents" | "record">("documents");
  const [generalDocs, setGeneralDocs] = useState<VisitDocument[]>([]);
  const [generalLinked, setGeneralLinked] = useState<boolean | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!bookingId) return;
    const seq = ++loadSeq.current;
    const gaps = opts?.silent ? [0] : [0, 1000, 2500];
    let res: Awaited<ReturnType<typeof fetchBooking>> | null = null;
    for (let attempt = 0; attempt < gaps.length; attempt++) {
      if (gaps[attempt]) {
        await new Promise((r) => setTimeout(r, gaps[attempt]));
      }
      if (seq !== loadSeq.current) return;
      res = await fetchBooking(bookingId);
      if (seq !== loadSeq.current) return;
      if (res.status === "successful" && res.data) break;
      const msg = (res.message || "").toLowerCase();
      if (/not found|forbidden|unauthorized/.test(msg)) break;
    }
    if (seq !== loadSeq.current || !res) return;
    if (res.status !== "successful" || !res.data) {
      if (!opts?.silent && !clinicalReady.current) {
        setError(res.message || "Visit not found");
        setBooking(null);
        setChartReady(false);
      }
      return;
    }
    const b = res.data as BookingRow;
    if (seq !== loadSeq.current) return;
    setBooking(b);
    const replaceForm = !opts?.silent || !clinicalDirty.current;
    if (replaceForm) {
      if (!opts?.silent || !clinicalReady.current) {
        setRemarks(doctorRemarksForEdit(b.doctorRemarks));
        setComplaint(String(b.disease || "").trim());
      }
      if (!uploadingRef.current) {
        const docs = Array.isArray(b.documents) ? b.documents : [];
        documentsRef.current = docs;
        setDocuments(docs);
      }
      setMedicines(Array.isArray(b.medicines) ? b.medicines : []);
      const chart = normalizeClinicalAssessment(b.clinicalAssessment);
      const storedDiagnosis = String(chart?.diagnosis || "").trim();
      diagnosisRef.current = storedDiagnosis;
      setDiagnosis(storedDiagnosis);
      const storedAdvice = String(chart?.advice || "").trim();
      adviceRef.current = storedAdvice;
      setAdvice(storedAdvice);
      clinicalRef.current = chart;
      setClinicalAssessment(chart);
      if (!opts?.silent) clinicalDirty.current = false;
      clinicalReady.current = true;
    }
    setChartReady(true);
    setError("");
  }, [bookingId]);

  useEffect(() => {
    clinicalReady.current = false;
    clinicalDirty.current = false;
    clinicalRef.current = null;
    setChartReady(false);
  }, [bookingId]);

  useEffect(() => {
    void load();
    void getSessionUserId().then(setSelfId);
  }, [load]);

  useEffect(() => {
    if (!bookingId || !chartReady) return;
    let alive = true;
    void fetchGeneralDocuments(bookingId).then((res) => {
      if (!alive || res.status !== "successful" || !res.data) return;
      setGeneralLinked(Boolean(res.data.patientLinked));
      setGeneralDocs(Array.isArray(res.data.documents) ? res.data.documents : []);
    });
    return () => {
      alive = false;
    };
  }, [bookingId, chartReady]);


  const fromShared = sharedBookings.find((b) => b.id === bookingId) ?? null;

  useEffect(() => {
    if (!fromShared || !chartReady) return;
    setBooking((prev) =>
      prev
        ? patchBookingFields(
            prev,
            fromShared as unknown as Record<string, unknown>,
          )
        : prev,
    );
  }, [fromShared, chartReady]);

  useEffect(() => {
    if (bookingTick === 0) return;
    void load({ silent: true });
  }, [bookingTick, load]);

  const completed =
    String(booking?.status || "").toUpperCase() === "COMPLETED";
  const futureDay = booking
    ? isAfterClinicToday(booking.slotStart || booking.sessionDate || null)
    : false;
  const chartLocked = completed || futureDay;
  const peerId = booking?.patientId || booking?.patient?.id || null;
  const patientName =
    booking?.patientName ||
    booking?.patient?.name ||
    booking?.patientPhone ||
    "Patient";
  const p = booking?.patient;

  function chartWithDiagnosis(
    chart: ClinicalAssessment | null,
  ): ClinicalAssessment {
    return {
      ...(chart ?? {
        vitals: { breakfast: null, values: {} },
        pain: [],
        allergies: [],
        noKnownAllergies: false,
      }),
      diagnosis: diagnosisRef.current.trim().slice(0, 500),
      advice: adviceRef.current.trim().slice(0, 1000),
    };
  }

  async function persistMedicines(next: Med[]) {
    if (!bookingId || booking?.status === "COMPLETED" || futureDay) return
    setBusy(true)
    setError("")
    let docsToSave = documentsRef.current
    if (docsToSave.length === 0) {
      const resFresh = await fetchBooking(bookingId)
      const serverDocs = Array.isArray(resFresh.data?.documents)
        ? (resFresh.data!.documents as VisitDocument[])
        : []
      if (serverDocs.length > 0) {
        docsToSave = serverDocs
        documentsRef.current = serverDocs
        setDocuments(serverDocs)
      }
    }
    const chart = chartWithDiagnosis(clinicalRef.current);
    const res = await updateVisit(bookingId, {
      doctorRemarks: remarks,
      medicines: next,
      documents: docsToSave,
      ...(clinicalReady.current || chart.diagnosis || chart.advice
        ? { clinicalAssessment: chart }
        : {}),
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
    if (!bookingId || futureDay) return false;
    setBusy(true);
    setError("");
    const draftName = medName.trim();
    const nextMedicines = draftName
      ? [
          ...medicines,
          {
            name: draftName,
            amount: medAmount.trim() || undefined,
            times: medTimes.length ? [...medTimes] : undefined,
          },
        ]
      : medicines;
    const disease = complaint.trim()
    const res = await updateVisit(bookingId, {
      doctorRemarks: remarks,
      ...(disease ? { disease } : {}),
      medicines: nextMedicines,
      documents: documentsRef.current,
      ...(clinicalReady.current || diagnosisRef.current.trim() || adviceRef.current.trim()
        ? { clinicalAssessment: chartWithDiagnosis(clinicalRef.current) }
        : {}),
      ...(alsoStatus ? { status: alsoStatus } : {}),
    });
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Save failed");
      return false;
    }
    await load();
    return true;
  }

  async function saveComplaint(nextRaw: string) {
    if (!bookingId || futureDay) return;
    const next = nextRaw.trim().slice(0, 500);
    const previous = String(booking?.disease || "").trim();
    if (next === previous) return;
    if (!next) {
      setError("Chief complaint is required.");
      setComplaint(previous);
      return;
    }
    setError("");
    const res = await updateVisit(bookingId, { disease: next });
    if (res.status !== "successful") {
      setError(res.message || "Could not save the chief complaint.");
      setComplaint(previous);
      return;
    }
    setComplaint(next);
    await load({ silent: true });
  }

  async function saveDiagnosis(nextRaw: string) {
    if (!bookingId || futureDay || booking?.status === "COMPLETED") return;
    const next = nextRaw.trim().slice(0, 500);
    const previous = String(
      normalizeClinicalAssessment(booking?.clinicalAssessment)?.diagnosis || "",
    ).trim();
    if (next === previous) return;
    diagnosisRef.current = next;
    const chart = chartWithDiagnosis(clinicalRef.current);
    clinicalRef.current = chart;
    clinicalReady.current = true;
    clinicalDirty.current = true;
    setClinicalAssessment(chart);
    setError("");
    const res = await updateVisit(bookingId, { clinicalAssessment: chart });
    if (res.status !== "successful") {
      setError(res.message || "Could not save the diagnosis.");
      diagnosisRef.current = previous;
      setDiagnosis(previous);
      return;
    }
    setDiagnosis(next);
    await load({ silent: true });
  }

  async function saveAdvice(nextRaw: string) {
    if (!bookingId || futureDay || booking?.status === "COMPLETED") return;
    const next = nextRaw.trim().slice(0, 1000);
    const previous = String(
      normalizeClinicalAssessment(booking?.clinicalAssessment)?.advice || "",
    ).trim();
    if (next === previous) return;
    adviceRef.current = next;
    const chart = chartWithDiagnosis(clinicalRef.current);
    clinicalRef.current = chart;
    clinicalReady.current = true;
    clinicalDirty.current = true;
    setClinicalAssessment(chart);
    setError("");
    const res = await updateVisit(bookingId, { clinicalAssessment: chart });
    if (res.status !== "successful") {
      setError(res.message || "Could not save the advice.");
      adviceRef.current = previous;
      setAdvice(previous);
      return;
    }
    setAdvice(next);
    await load({ silent: true });
  }

  async function sendToCustomer() {
    if (!bookingId || sendingWa) return;
    if (booking?.status !== "COMPLETED" && !futureDay) {
      const saved = await saveVisit();
      if (!saved) return;
    }
    setSendingWa(true);
    setError("");
    const res = await sendClinicLogWhatsApp(bookingId);
    setSendingWa(false);
    if (res.status !== "successful") {
      setError(res.message || "Could not send via WhatsApp.");
      return;
    }
    Alert.alert("Sent", "Prescription PDF sent to the customer on WhatsApp.");
  }

  async function applyStatus(status: string, reason?: string) {
    if (!bookingId) return;
    if (
      futureDay &&
      (status === "WAITING" ||
        status === "IN_PROGRESS" ||
        status === "COMPLETED")
    ) {
      setError(
        "You can document this visit on its appointment day, not on a later day.",
      );
      return;
    }
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") {
      setError("Completed appointments cannot change status.");
      return;
    }
    setBusy(true);
    const res = await updateBookingStatus(bookingId, status, reason);
    setBusy(false);
    if (res.status !== "successful") {
      setError(res.message || "Update failed");
      return;
    }
    await load();
  }

  function setStatus(status: string, reasons?: string[]) {
    if (reasons?.length) {
      Alert.alert(
        status === "NO_SHOW" ? "Mark as no-show?" : "Cancel this visit?",
        "Tap a reason.",
        [
          { text: "Keep", style: "cancel" },
          ...reasons.map((reason) => ({
            text: reason,
            style: "destructive" as const,
            onPress: () => void applyStatus(status, reason),
          })),
        ],
      );
      return;
    }
    void applyStatus(status);
  }

  async function attachFromLibrary() {
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open photos.");
    }
  }

  async function attachDocument() {
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open files.");
    }
  }

  async function uploadAsset(file: {
    uri: string;
    name: string;
    mimeType?: string | null;
  }) {
    if (!bookingId || futureDay) return;
    if (!clinicalReady.current) {
      setError("Wait for the visit to finish loading, then add the file again.");
      return;
    }
    setUploading(true);
    uploadingRef.current = true;
    loadSeq.current += 1;
    setError("");
    try {
      const uploaded = await uploadVisitFile(file);
      let base = documentsRef.current;
      if (base.length === 0) {
        const fresh = await fetchBooking(bookingId);
        const serverDocs = Array.isArray(fresh.data?.documents)
          ? (fresh.data.documents as VisitDocument[])
          : [];
        if (serverDocs.length > 0) base = serverDocs;
      }
      const next = [
        ...base,
        {
          name: file.name || uploaded.original_filename || "Document",
          url: uploaded.secure_url,
          uploadedAt: new Date().toISOString(),
        },
      ];
      documentsRef.current = next;
      const res = await updateVisit(bookingId, { documents: next });
      if (res.status !== "successful") {
        setError(res.message || "The file uploaded, but it was not saved on this visit.");
        return;
      }
      setDocuments(next);
      loadSeq.current += 1;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload document.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  async function removeDocument(idx: number) {
    if (!bookingId || chartLocked) return;
    loadSeq.current += 1;
    const next = documentsRef.current.filter((_, i) => i !== idx);
    const previous = documentsRef.current;
    documentsRef.current = next;
    setDocuments(next);
    const res = await updateVisit(bookingId, { documents: next });
    if (res.status !== "successful") {
      documentsRef.current = previous;
      setDocuments(previous);
      setError(res.message || "Could not remove that file.");
    }
  }

  async function uploadGeneral(file: {
    uri: string;
    name: string;
    mimeType?: string | null;
  }) {
    if (!bookingId || generalLinked === false) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadVisitFile(file);
      const res = await addGeneralDocument(bookingId, {
        name: file.name || uploaded.original_filename || "Document",
        url: uploaded.secure_url,
      });
      if (res.status !== "successful") {
        setError(res.message || "The file uploaded, but it was not saved on the patient record.");
        return;
      }
      const fresh = await fetchGeneralDocuments(bookingId);
      if (fresh.status === "successful" && fresh.data) {
        setGeneralLinked(Boolean(fresh.data.patientLinked));
        setGeneralDocs(Array.isArray(fresh.data.documents) ? fresh.data.documents : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload document.");
    } finally {
      setUploading(false);
    }
  }

  if (!booking && !error) return <Loading />;

  if (!booking) {
    return (
      <View style={styles.rootPad}>
        <ErrorText text={error || "Visit not found"} />
        <PrimaryButton
          label="Try again"
          onPress={() => {
            setError("");
            void load();
          }}
        />
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
              <Text style={styles.bannerEyebrow}>
                {[whenLabel(booking), bookingDoctorName(booking)]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.bannerName}>{patientName}</Text>
              <Text style={styles.bannerSub}>
                {complaint.trim() || "No chief complaint"}
              </Text>
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
              <Text style={styles.metaQuiet}>
                Mode: {booking.mode.replace(/_/g, " ")}
              </Text>
            ) : null}
            {booking.channel ? (
              <Text style={styles.metaQuiet}>
                Channel: {booking.channel.replace(/_/g, " ")}
              </Text>
            ) : null}
            {booking.tokenNumber != null ? (
              <Text style={styles.rowLabel}>Token: #{booking.tokenNumber}</Text>
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
          {nextActions(booking.status)
            .filter((s) => !s.opensVisit)
            .filter(
              (s) =>
                !futureDay ||
                (s.status !== "WAITING" &&
                  s.status !== "IN_PROGRESS" &&
                  s.status !== "COMPLETED"),
            )
            .map((s) => (
            <Chip
              key={s.status}
              label={s.label}
              onPress={
                busy ? undefined : () => setStatus(s.status, s.reasons)
              }
            />
          ))}
          {completed ? (
            <>
              <RxButton bookingId={booking.id} status={booking.status} />
              <Text style={styles.lockedHint}>
                Finished — cannot cancel or reschedule. Rx opens the clinic log
                and can send it on WhatsApp.
              </Text>
            </>
          ) : null}
        </View>

        <Text style={styles.section}>Vitals · Pain · Allergies · Medicines</Text>
        {futureDay ? (
          <Text style={styles.lockedHint}>
            Documentation opens on the appointment day. Any time later today
            can still be documented.
          </Text>
        ) : (
          <Text style={styles.lockedHint}>
            Capture vitals, pain, allergies, and medicines from the tabs. Tap Save
            clinical below (or Save visit notes at the bottom).
          </Text>
        )}
        {chartReady ? (
          <ClinicalAssessmentPanel
            mastersRaw={
              membership?.practice.clinicalMasters ??
              booking.practice?.clinicalMasters
            }
            value={clinicalAssessment}
            readOnly={chartLocked}
            onChange={(next) => {
              const merged = chartWithDiagnosis(next);
              clinicalDirty.current = true;
              clinicalReady.current = true;
              clinicalRef.current = merged;
              setClinicalAssessment(merged);
            }}
            medicines={
              <>
                {!chartLocked ? (
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
                  medicines.map((m, idx) => {
                    const dosePart = m.dose?.trim()
                      ? `${m.dose.trim()}${m.doseUnit ? ` ${m.doseUnit.trim()}` : ""}`
                      : m.amount?.trim() || "—";
                    const metaParts = [
                      dosePart,
                      m.route?.trim() ? `via ${m.route.trim()}` : null,
                      m.frequency?.trim() || (m.times?.length ? m.times.join(", ") : null),
                      m.duration?.trim()
                        ? `for ${m.duration.trim()} ${m.durationUnit?.trim() || "days"}`
                        : null,
                    ].filter(Boolean);

                    return (
                      <View key={`${m.name}-${idx}`} style={styles.medRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.medName}>
                            {m.name}
                            {m.strength?.trim() ? ` (${m.strength.trim()})` : ""}
                          </Text>
                          <Text style={styles.meta}>
                            {metaParts.length ? metaParts.join(" · ") : "—"}
                          </Text>
                          {m.instruction?.trim() ? (
                            <Text
                              style={[
                                styles.metaQuiet,
                                { color: colors.brand, marginTop: 2, fontWeight: "600" },
                              ]}
                            >
                              📌 {m.instruction.trim()}
                            </Text>
                          ) : null}
                        </View>
                        {!chartLocked ? (
                          <Chip
                            label="Remove"
                            onPress={() => removeMedicine(idx)}
                          />
                        ) : null}
                      </View>
                    );
                  })
                )}
                <Text style={[styles.section, { marginTop: space.md }]}>Advice</Text>
                <Text style={styles.lockedHint}>
                  Printed under the medicines. This is not the clinical remarks.
                </Text>
                <TextInput
                  value={advice}
                  onChangeText={(text) => {
                    adviceRef.current = text;
                    clinicalDirty.current = true;
                    setAdvice(text);
                  }}
                  onBlur={() => void saveAdvice(advice)}
                  editable={!chartLocked}
                  multiline
                  maxLength={1000}
                  placeholder="Advice for the patient"
                  placeholderTextColor={colors.inkFaint}
                  style={[styles.area, chartLocked && styles.readonly]}
                />
              </>
            }
          />
        ) : (
          <Text style={styles.hint}>Loading chart…</Text>
        )}
        {!chartLocked ? (
          <View style={{ gap: space.sm }}>
            <PrimaryButton
              label={busy ? "Saving…" : "Save clinical"}
              onPress={() => void saveVisit()}
              busy={busy}
              disabled={busy}
            />
            <PrimaryButton
              label={sendingWa ? "Sending…" : "Send to customer"}
              onPress={() => void sendToCustomer()}
              busy={sendingWa}
              disabled={busy || sendingWa}
            />
          </View>
        ) : null}

        <Text style={styles.section}>Chief complaint</Text>
        <Text style={styles.lockedHint}>
          Enter a new complaint or replace the one saved at booking.
        </Text>
        <TextInput
          value={complaint}
          onChangeText={setComplaint}
          onBlur={() => void saveComplaint(complaint)}
          editable={!futureDay}
          multiline
          maxLength={500}
          placeholder="Chief complaint"
          placeholderTextColor={colors.inkFaint}
          style={[styles.area, futureDay && styles.readonly]}
        />

        <Text style={styles.section}>Diagnosis</Text>
        <Text style={styles.lockedHint}>
          This is printed on the prescription sent to the patient.
        </Text>
        <TextInput
          value={diagnosis}
          onChangeText={(text) => {
            diagnosisRef.current = text;
            setDiagnosis(text);
          }}
          onBlur={() => void saveDiagnosis(diagnosis)}
          editable={!futureDay && booking?.status !== "COMPLETED"}
          multiline
          maxLength={500}
          placeholder="Diagnosis"
          placeholderTextColor={colors.inkFaint}
          style={[
            styles.area,
            (futureDay || booking?.status === "COMPLETED") && styles.readonly,
          ]}
        />

        <Text style={styles.section}>Doctor Notes</Text>
        <Text style={styles.lockedHint}>
          Clinical doctor notes for this visit. These are not printed as prescription advice.
        </Text>
        <TextInput
          value={remarks}
          onChangeText={setRemarks}
          editable={!chartLocked}
          multiline
          placeholder="Doctor notes, clinical observations, follow-up…"
          placeholderTextColor={colors.inkFaint}
          style={[styles.area, styles.doctorNotesArea, chartLocked && styles.readonly]}
        />

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
          <Chip
            label={`Patient record${generalDocs.length ? ` (${generalDocs.length})` : ""}`}
            active={sideTab === "record"}
            onPress={() => setSideTab("record")}
          />
        </View>

        {sideTab === "record" ? (
          <View style={styles.card}>
            {generalLinked === false ? (
              <Text style={styles.hint}>
                This visit isn&apos;t linked to a registered patient, so there is no patient record for general documents.
              </Text>
            ) : (
              <>
                <View style={{ gap: space.sm, marginBottom: space.md }}>
                  <PrimaryButton
                    label={uploading ? "Uploading…" : "Add photo to record"}
                    onPress={() =>
                      void (async () => {
                        try {
                          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                          if (!perm.granted) {
                            setError("Photo library permission is required.");
                            return;
                          }
                          const picked = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ["images"],
                            quality: 0.8,
                          });
                          if (picked.canceled || !picked.assets?.[0]) return;
                          const asset = picked.assets[0];
                          await uploadGeneral({
                            uri: asset.uri,
                            name: asset.fileName || `photo-${Date.now()}.jpg`,
                            mimeType: asset.mimeType,
                          });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not open photos.");
                        }
                      })()
                    }
                    busy={uploading}
                  />
                  <PrimaryButton
                    label="Add file to record"
                    onPress={() =>
                      void (async () => {
                        try {
                          const picked = await DocumentPicker.getDocumentAsync({
                            copyToCacheDirectory: true,
                            multiple: false,
                          });
                          if (picked.canceled || !picked.assets?.[0]) return;
                          const asset = picked.assets[0];
                          await uploadGeneral({
                            uri: asset.uri,
                            name: asset.name || `document-${Date.now()}`,
                            mimeType: asset.mimeType,
                          });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not open files.");
                        }
                      })()
                    }
                    busy={uploading}
                    tone="ghost"
                  />
                </View>
                {generalLinked === null ? (
                  <Text style={styles.hint}>Loading patient record…</Text>
                ) : generalDocs.length === 0 ? (
                  <Text style={styles.hint}>No general documents yet.</Text>
                ) : (
                  generalDocs.map((d, idx) => (
                    <Pressable
                      key={`${d.url}-${idx}`}
                      onPress={() => void Linking.openURL(d.url)}
                      style={styles.docRow}
                    >
                      <Text style={styles.medName} numberOfLines={1}>
                        {d.name || "View document"}
                      </Text>
                    </Pressable>
                  ))
                )}
              </>
            )}
          </View>
        ) : sideTab === "chat" ? (
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
            {!chartLocked ? (
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
                  {!chartLocked ? (
                    <Chip
                      label="Remove"
                      onPress={() => void removeDocument(idx)}
                    />
                  ) : null}
                </View>
              ))
            )}
          </View>
        )}

        <ErrorText text={error} />

        {!chartLocked ? (
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
  metaQuiet: {
    fontSize: 11,
    color: colors.inkSoft,
    marginBottom: 4,
    lineHeight: 14,
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
  doctorNotesArea: {
    minHeight: 180,
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
