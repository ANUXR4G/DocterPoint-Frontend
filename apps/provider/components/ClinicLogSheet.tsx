import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, ErrorText, PrimaryButton } from "@/components/ui";
import { normalizeClinicalAssessment } from "@/lib/clinicalMasters";
import { withDrTitle } from "@/lib/doctorName";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import {
  fetchBooking,
  sendClinicLogWhatsApp,
} from "@/lib/procto";
import {
  formatPracticeDate,
  formatPracticeDateTime,
  formatPracticeTime,
} from "@/lib/practiceTime";
import { colors, radii, space } from "@/lib/theme";
import { consultationTypeLabel, type BookingRow } from "@/lib/types";

type LogBooking = BookingRow & {
  slotEnd?: string | null;
  slot_end?: string | null;
  provider?: BookingRow["provider"] & { licenseNo?: string | null };
};

function dash(v?: string | number | null) {
  if (v == null || v === "") return "—";
  return String(v);
}

function dosageLine(m: { amount?: string; times?: string[] }) {
  const times = (m.times ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(", ");
  return [times, m.amount?.trim()].filter(Boolean).join(" · ") || "—";
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.line}>
      <Text style={styles.lineLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

export function ClinicLogSheet({
  visible,
  bookingId,
  onClose,
}: {
  visible: boolean;
  bookingId: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<LogBooking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!visible || !bookingId) return;
    let alive = true;
    setLoading(true);
    setError("");
    setNotice("");
    setBooking(null);
    void fetchBooking(bookingId).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.status !== "successful" || !res.data) {
        setError(res.message || "Could not load clinic log.");
        return;
      }
      setBooking(res.data as LogBooking);
    });
    return () => {
      alive = false;
    };
  }, [visible, bookingId]);

  async function send() {
    if (!bookingId || sending) return;
    setSending(true);
    setNotice("");
    const res = await sendClinicLogWhatsApp(bookingId);
    setSending(false);
    if (res.status !== "successful") {
      setNotice(res.message || "Could not send via WhatsApp.");
      return;
    }
    setNotice("Clinic log / prescription sent to patient WhatsApp.");
  }

  const assessment = normalizeClinicalAssessment(booking?.clinicalAssessment);
  const values = assessment?.vitals?.values ?? {};
  const p = booking?.patient;
  const patientName = p?.name || booking?.patientName || "Patient";
  const phone = formatPhoneDisplay(
    p?.contactNumber || p?.phone || booking?.patientPhone,
  );
  const doctorName = withDrTitle(booking?.provider?.name) || "—";
  const license = booking?.provider?.licenseNo?.trim();
  const slotStart = booking?.slotStart;
  const slotEnd = booking?.slotEnd || booking?.slot_end;
  const appointmentLabel = slotStart
    ? [
        formatPracticeDate(slotStart),
        formatPracticeTime(slotStart),
        slotEnd ? `– ${formatPracticeTime(slotEnd)}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : booking?.sessionDate
      ? formatPracticeDate(booking.sessionDate)
      : "—";
  const chief =
    booking?.disease?.trim() &&
    !/^general\s+consultation$/i.test(booking.disease.trim())
      ? booking.disease.trim()
      : "";
  const diagnosis =
    booking?.disease?.trim() ||
    consultationTypeLabel(booking?.consultationType) ||
    "";
  const medicines = (booking?.medicines ?? []).filter((m) => m?.name?.trim());
  const remarks = String(booking?.doctorRemarks || "").trim();
  const recordedAt =
    assessment?.savedAt || assessment?.vitals?.recordedAt
      ? formatPracticeDateTime(
          assessment.savedAt || assessment.vitals?.recordedAt || "",
        )
      : slotStart
        ? formatPracticeDateTime(slotStart)
        : "—";
  const vitals = [
    ["Ht (cm)", values.ht],
    ["Wt (kg)", values.wt],
    ["BMI", values.bmi],
    ["Temp (°C)", values.temp],
    ["BP", values.bp_sys != null || values.bp_dia != null ? `${values.bp_sys ?? "—"}/${values.bp_dia ?? "—"}` : null],
    ["PR", values.pr],
    ["SpO2", values.spo2],
    ["RR", values.rr],
    ["RBS", values.rbs],
  ] as Array<[string, string | number | null | undefined]>;
  const allergyText = !assessment || assessment.noKnownAllergies
    ? "No known allergy"
    : (assessment.allergies ?? []).filter((r) => r.name?.trim()).length
      ? (assessment.allergies ?? [])
          .filter((r) => r.name?.trim())
          .map((r) =>
            [r.name, r.severity, r.active === "Yes" ? "Active" : null]
              .filter(Boolean)
              .join(" — "),
          )
          .join("; ")
      : "No known allergy";
  const painRows = (assessment?.pain ?? []).filter(
    (r) => r.scale?.trim() || r.score?.trim() || r.location?.trim(),
  );
  const painText = painRows.length
    ? painRows
        .map((r) =>
          [r.scale, r.score, r.location ? `Location: ${r.location}` : null, r.type]
            .filter(Boolean)
            .join(" · "),
        )
        .join("; ")
    : "No Pain Complaints Recorded";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Clinic log and Rx</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.muted}>Loading clinic log…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <ErrorText text={error} />
          </View>
        ) : booking ? (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 32 }}>
            <View style={styles.card}>
              <Line label="Patient's Name" value={patientName} />
              <Line label="Mobile No" value={dash(phone)} />
              <Line label="Patient MRN" value={dash(p?.mrn)} />
              <Line
                label="Date of Birth"
                value={
                  p?.dateOfBirth
                    ? formatPracticeDate(p.dateOfBirth) || dash(p.dateOfBirth)
                    : "—"
                }
              />
              <Line
                label="Age / Gender"
                value={
                  [p?.age != null ? String(p.age) : null, p?.gender]
                    .filter(Boolean)
                    .join(" / ") || "—"
                }
              />
              <Line label="Appointment" value={appointmentLabel} />
              <Line
                label="Dr. Name"
                value={license ? `${doctorName} (${license})` : doctorName}
              />
            </View>

            <Text style={styles.h}>Chief complaint</Text>
            <Text style={styles.body}>
              {chief ? `Primary reason: ${chief}` : "No chief complaint recorded."}
            </Text>

            <Text style={styles.h}>Vital signs</Text>
            <Text style={styles.muted}>{recordedAt}</Text>
            <View style={styles.vitals}>
              {vitals.map(([label, value]) => (
                <Text key={label} style={styles.vital}>
                  {label} {value == null || value === "" ? "—" : String(value)}
                </Text>
              ))}
            </View>

            <Text style={styles.h}>Allergies</Text>
            <Text style={styles.body}>{allergyText}</Text>
            <Text style={styles.h}>Pain complaints</Text>
            <Text style={styles.body}>{painText}</Text>
            <Text style={styles.h}>Diagnosis</Text>
            <Text style={styles.body}>{diagnosis || "No diagnosis recorded."}</Text>
            <Text style={styles.h}>Clinical remarks</Text>
            <Text style={styles.body}>{remarks || "No clinical remarks recorded."}</Text>

            <Text style={styles.h}>Prescription (Rx)</Text>
            {medicines.length === 0 ? (
              <Text style={styles.muted}>No medicines prescribed.</Text>
            ) : (
              medicines.map((m, i) => (
                <View key={`${m.name}-${i}`} style={styles.med}>
                  <Text style={styles.medName}>{m.name.toUpperCase()}</Text>
                  <Text style={styles.muted}>{dosageLine(m)}</Text>
                </View>
              ))
            )}
            <ErrorText text={notice.startsWith("Could") ? notice : ""} />
            {notice && !notice.startsWith("Could") ? (
              <Text style={styles.ok}>{notice}</Text>
            ) : null}
            <View style={{ marginTop: space.lg }}>
              <PrimaryButton
                label={sending ? "Sending…" : "Send to customer (Via WhatsApp)"}
                onPress={() => void send()}
                busy={sending}
              />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

/** Finished visits only — same Rx menu as the web appointments column. */
export function RxButton({ bookingId, status }: { bookingId: string; status?: string | null }) {
  const [open, setOpen] = useState(false);
  if (String(status || "").toUpperCase() !== "COMPLETED") return null;

  function sendNow() {
    void sendClinicLogWhatsApp(bookingId).then((res) => {
      Alert.alert(
        res.status === "successful" ? "Sent" : "Could not send",
        res.status === "successful"
          ? "Clinic log / prescription sent to patient WhatsApp."
          : res.message || "Could not send via WhatsApp.",
      );
    });
  }

  return (
    <>
      <Chip
        label="Rx"
        onPress={() =>
          Alert.alert("Prescription / clinic log", undefined, [
            { text: "View", onPress: () => setOpen(true) },
            { text: "Send to customer (Via WhatsApp)", onPress: sendNow },
            { text: "Keep", style: "cancel" },
          ])
        }
      />
      <ClinicLogSheet
        visible={open}
        bookingId={open ? bookingId : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  close: { color: colors.brand, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  card: {
    backgroundColor: "#F0F9FF",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    padding: space.md,
    gap: 4,
  },
  line: { fontSize: 14, color: colors.ink },
  lineLabel: { fontWeight: "700" },
  h: {
    marginTop: space.lg,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.ink,
  },
  body: { fontSize: 14, lineHeight: 20, color: colors.ink },
  muted: { fontSize: 13, color: colors.inkSoft },
  vitals: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  vital: {
    backgroundColor: colors.paperRaised,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
    overflow: "hidden",
  },
  med: { marginTop: 8 },
  medName: { fontWeight: "700", color: colors.ink },
  ok: { marginTop: space.sm, color: colors.ok, fontWeight: "600" },
});
