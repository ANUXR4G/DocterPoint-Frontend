import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CareChatPanel } from "@/components/CareChatPanel";
import { CareGlyph } from "@/components/mobile/careArt";
import { VisitRx } from "@/components/VisitRx";
import {
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  bookingStatusLabel,
  bookingWhenMs,
  chiefComplaintOf,
  effectiveBookingStatus,
} from "@/lib/bookingStats";
import { attachPatientVisitDocument } from "@/lib/chat";
import { withDrTitle } from "@/lib/doctorName";
import { contentBottomPad, safeTopInset } from "@/lib/dockLayout";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { getSessionUserId } from "@/lib/sessionUser";
import { useCareTheme } from "@/lib/careTheme";
import { sharePrescriptionPdf } from "@/lib/sharePrescription";
import { formatPracticeDate, formatPracticeDateTime, practiceDayKey } from "@/lib/practiceTime";
import { colors, radii, space } from "@/lib/theme";
import { type BookingDetail } from "@/lib/types";
import {
  pickVisitDocument,
  pickVisitPhoto,
  uploadVisitFile,
} from "@/lib/visitUpload";

type VisitMed = {
  name?: string;
  amount?: string;
  times?: string[];
  strength?: string;
  route?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  startDate?: string;
  endDate?: string;
  instruction?: string;
};

const MEDICINE_COLUMNS: Array<{ key: keyof VisitMed; label: string; width: number }> = [
  { key: "name", label: "Medicine", width: 140 },
  { key: "strength", label: "Strength", width: 90 },
  { key: "route", label: "Route", width: 100 },
  { key: "dose", label: "Dose", width: 80 },
  { key: "doseUnit", label: "Dose Unit", width: 90 },
  { key: "frequency", label: "Frequency", width: 120 },
  { key: "duration", label: "Duration", width: 90 },
  { key: "durationUnit", label: "Duration Unit", width: 110 },
  { key: "startDate", label: "Start Time", width: 110 },
  { key: "endDate", label: "End Time", width: 110 },
  { key: "instruction", label: "Special Instruction", width: 160 },
];

const emptyVisitMedicine: VisitMed = {};

function medicineCell(med: VisitMed, key: keyof VisitMed): string {
  if (key === "dose") return med.dose?.trim() || med.amount?.trim() || "—";
  if (key === "frequency") {
    return med.frequency?.trim() || (med.times?.length ? med.times.join(", ") : "") || "—";
  }
  const value = med[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return "—";
}

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { theme } = useCareTheme();
  const insets = useSafeAreaInsets();
  const { bookings: sharedBookings, liveConnected, refresh } = usePatientLive();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [clinicOpen, setClinicOpen] = useState(false);
  const [rxBusy, setRxBusy] = useState(false);
  const [rxError, setRxError] = useState("");

  const fromShared = sharedBookings.find((b) => b.id === bookingId) ?? null;

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!bookingId) return;
    const soft = Boolean(opts?.soft);
    if (!soft) {
      setLoading(true);
      setError("");
    }
    let res = await api<BookingDetail>(`/procto/bookings/${bookingId}`);
    if (res.status !== "successful" || !res.data) {
      await new Promise((r) => setTimeout(r, 800));
      res = await api<BookingDetail>(`/procto/bookings/${bookingId}`);
    }
    const uid = await getSessionUserId();
    setSelfUserId(uid);
    if (!soft) setLoading(false);
    if (res.status !== "successful" || !res.data) {
      if (!soft) setError(res.message || "Visit not found.");
      return;
    }
    setBooking(res.data);
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!fromShared) return;
    setBooking((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: fromShared.status || prev.status,
        slotStart: fromShared.slotStart || prev.slotStart,
        slot_start: fromShared.slot_start || prev.slot_start,
      };
    });
  }, [fromShared]);

  useEffect(() => {
    if (!liveConnected) return;
    void load({ soft: true });
  }, [liveConnected, load]);

  const display = booking;

  if (loading && !display) return <Loading />;

  if (!display) {
    return (
      <Screen style={{ backgroundColor: theme.paper }}>
        <View style={styles.content}>
          <ErrorText text={error || "Visit not found."} />
          <PrimaryButton label="Try again" onPress={() => void load()} />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const canCancel = ["SCHEDULED", "REQUESTED", "ACCEPTED", "CONFIRMED"].includes(
    String(display.status || "").toUpperCase(),
  );

  function cancelVisit() {
    Alert.alert("Cancel this appointment?", "The clinic will be notified.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel appointment",
        style: "destructive",
        onPress: () => {
          setCancelBusy(true);
          setFlash("");
          void api(`/procto/bookings/${bookingId}/cancel`, {
            method: "PATCH",
            body: JSON.stringify({}),
          }).then(async (res) => {
            setCancelBusy(false);
            if (res.status === "successful") {
              setFlash("Appointment canceled.");
              await refresh({ soft: true, force: true });
              await load({ soft: true });
              return;
            }
            setFlash(res.message || "Cancel failed.");
          });
        },
      },
    ]);
  }

  const displayStatus = effectiveBookingStatus(display);
  const isCompleted = display.status === "COMPLETED";
  const documents = Array.isArray(display.documents) ? display.documents : [];
  const visitMedicines = ((Array.isArray(display.medicines) ? display.medicines : []) as VisitMed[]).filter(
    (med) => med?.name?.trim(),
  );
  const canAttachDocs =
    displayStatus !== "CANCELED" && displayStatus !== "NO_SHOW";

  async function attachFile(kind: "photo" | "file") {
    const id = display?.id;
    if (!id || attaching || !canAttachDocs) return;
    setAttachError("");
    const picked =
      kind === "photo" ? await pickVisitPhoto() : await pickVisitDocument();
    if (picked === "denied") {
      setAttachError("Photo access was blocked. Allow photos in Settings.");
      return;
    }
    if (!picked) return;
    setAttaching(true);
    try {
      const uploaded = await uploadVisitFile(picked);
      const res = await attachPatientVisitDocument(id, {
        name: uploaded.name,
        url: uploaded.url,
      });
      if (res.error) {
        setAttachError(res.error);
        return;
      }
      await load({ soft: true });
    } catch {
      setAttachError("Could not attach that file. Try again.");
    } finally {
      setAttaching(false);
    }
  }

  const doctor = withDrTitle(display.provider?.name) || display.practice?.name || "Clinic visit";
  const reason = chiefComplaintOf(display);
  const day = clinicDay(display);
  const clock = clinicClock(display.slotStart || display.slot_start);
  const address = display.location
    ? [display.location.address, display.location.name, display.location.city].filter(Boolean).join(", ")
    : "";
  const noShow = displayStatus === "NO_SHOW";
  const canceled = displayStatus === "CANCELED" || displayStatus === "CANCELLED";

  return (
    <Screen style={{ backgroundColor: theme.paper }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: safeTopInset(insets.top) + 12,
            paddingBottom: contentBottomPad(insets.bottom),
            paddingLeft: 18 + insets.left,
            paddingRight: 18 + insets.right,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Text style={[styles.back, { color: theme.ink }]}>Visits</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <View style={styles.hero}>
            <View style={[styles.avatar, { backgroundColor: theme.visit }]}>
              <Text style={{ color: theme.visitInk, fontWeight: "700" }}>{doctor.slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.doctor, { color: theme.ink }]}>{doctor}</Text>
              {reason ? <Text style={styles.reason}>{reason}</Text> : null}
            </View>
          </View>
          <View style={styles.metaRow}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: noShow
                    ? colors.noShowBg
                    : canceled
                      ? theme.alert
                      : theme.task,
                },
              ]}
            >
              <View
                style={[
                  styles.badgeDot,
                  {
                    backgroundColor: noShow
                      ? colors.noShow
                      : canceled
                        ? theme.alertInk
                        : theme.taskInk,
                  },
                ]}
              />
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: noShow
                      ? colors.noShowInk
                      : canceled
                        ? theme.alertInk
                        : theme.taskInk,
                  },
                ]}
              >
                {bookingStatusLabel(displayStatus)}
              </Text>
            </View>
            {day ? (
              <View style={styles.metaItem}>
                <CareGlyph name="calendar" size={14} color="#000000" />
                <Text style={styles.metaText}>{day}</Text>
              </View>
            ) : null}
            {clock ? (
              <View style={styles.metaItem}>
                <CareGlyph name="clock" size={14} color="#000000" />
                <Text style={styles.metaText}>
                  {clock.hour}:{clock.minute} {clock.period}
                </Text>
              </View>
            ) : null}
          </View>
          {address ? (
            <View style={styles.addressRow}>
              <CareGlyph name="pin" size={14} color="#000000" />
              <Text style={[styles.metaText, { flex: 1 }]}>{address}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cancelGap}>
          {canCancel ? (
            <PrimaryButton
              label={cancelBusy ? "Canceling…" : "Cancel appointment"}
              onPress={cancelVisit}
              busy={cancelBusy}
              tone="ink"
            />
          ) : isCompleted ? (
            <Text style={styles.lockedHint}>
              This visit is finished and cannot be canceled or rescheduled.
            </Text>
          ) : null}
          {flash ? <Text style={styles.body}>{flash}</Text> : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Pressable
            onPress={() => setClinicOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: clinicOpen }}
            style={styles.disclosure}
          >
            <Text style={[styles.cardTitle, { color: theme.ink, marginBottom: 0 }]}>Clinic</Text>
            <Text style={[styles.chevron, { color: theme.ink }]}>{clinicOpen ? "▾" : "▸"}</Text>
          </Pressable>
          {clinicOpen ? (
            <View>
              {display.practice?.name ? <Detail label="Clinic" value={display.practice.name} /> : null}
              {display.practice?.specialty ? <Detail label="Specialty" value={display.practice.specialty} /> : null}
              {display.provider?.experience != null ? (
                <Detail label="Experience" value={`${display.provider.experience} years`} />
              ) : null}
              {display.provider?.licenseNo ? <Detail label="License" value={display.provider.licenseNo} /> : null}
              {display.provider?.phone ? <Detail label="Phone" value={display.provider.phone} /> : null}
              {display.provider?.email ? <Detail label="Email" value={display.provider.email} /> : null}
              {display.createdAt || display.created_at ? (
                <Detail
                  label="Booked on"
                  value={formatPracticeDateTime(display.createdAt || display.created_at)}
                />
              ) : null}
              {display.provider?.description?.trim() ? (
                <Text style={styles.body}>{display.provider.description}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <VisitRx booking={display} />

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Medicines</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={styles.medHead}>
                <Text style={[styles.medHeadText, styles.medSno]}>S.No</Text>
                {MEDICINE_COLUMNS.map((col) => (
                  <Text key={col.key} style={[styles.medHeadText, { width: col.width }]}>
                    {col.label}
                  </Text>
                ))}
              </View>
              {(visitMedicines.length ? visitMedicines : [emptyVisitMedicine]).map((med, i) => (
                <View key={`${med.name}-${i}`} style={styles.medLine}>
                  <Text style={[styles.medCell, styles.medSno, { color: theme.ink }]}>{i + 1}</Text>
                  {MEDICINE_COLUMNS.map((col) => (
                    <Text
                      key={col.key}
                      style={[styles.medCell, { width: col.width, color: theme.ink }]}
                    >
                      {medicineCell(med, col.key)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={{ marginTop: space.md }}>
          <PrimaryButton
            label={rxBusy ? "Preparing PDF…" : "Prescription PDF"}
            onPress={() => {
              setRxError("");
              setRxBusy(true);
              void sharePrescriptionPdf(display)
                .catch(() => setRxError("Could not create the prescription PDF."))
                .finally(() => setRxBusy(false));
            }}
            busy={rxBusy}
            tone="ink"
          />
          <ErrorText text={rxError} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.ink }]}>Documents</Text>
          <Text style={styles.muted}>
            {canAttachDocs
              ? "Share lab reports or photos with your doctor for this visit."
              : "Attachments are closed for canceled or no-show visits."}
          </Text>
          {canAttachDocs ? (
            <View style={styles.attachRow}>
              <PrimaryButton
                label={attaching ? "Uploading…" : "Attach photo"}
                onPress={() => void attachFile("photo")}
                busy={attaching}
              />
              <PrimaryButton
                label="Attach PDF / file"
                onPress={() => void attachFile("file")}
                busy={attaching}
                tone="ink"
              />
            </View>
          ) : null}
          <ErrorText text={attachError} />
          {documents.length === 0 ? (
            <Text style={[styles.muted, { marginTop: space.sm }]}>
              No documents on this visit yet.
            </Text>
          ) : (
            documents.map((d, idx) => (
              <Pressable
                key={`${d.url}-${idx}`}
                onPress={() => {
                  if (d.url) void Linking.openURL(d.url);
                }}
                style={styles.docRow}
              >
                <Text style={styles.docLink}>{d.name || "View document"}</Text>
              </Pressable>
            ))
          )}
        </View>

        {selfUserId && display.provider?.id ? (
          <CareChatPanel
            selfUserId={selfUserId}
            peerUserId={display.provider.id}
            peerName={
              display.provider.name
                ? `Dr. ${display.provider.name.trim().replace(/^(?:dr\.\s*|dr\s+)+/i, "")}`
                : "Doctor"
            }
            subtitle="Doctor messages also arrive on WhatsApp. Do not use this for emergencies."
            bookingId={display.id}
            threadSince={display.createdAt ?? display.created_at ?? null}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function clinicDay(booking: BookingDetail) {
  const ms = bookingWhenMs(booking);
  if (!ms) return "";
  const key = practiceDayKey(ms);
  if (key === practiceDayKey(Date.now())) return "Today";
  if (key === practiceDayKey(Date.now() + 86_400_000)) return "Tomorrow";
  return formatPracticeDate(new Date(ms));
}

function clinicClock(slot: string | null | undefined) {
  if (!slot) return null;
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const hour24 = shifted.getUTCHours();
  return {
    hour: String(hour24 % 12 || 12),
    minute: String(shifted.getUTCMinutes()).padStart(2, "0"),
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {},
  backRow: { marginBottom: 14 },
  back: { fontSize: 15, fontWeight: "400" },
  card: { borderRadius: 22, padding: 14, marginBottom: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  doctor: { fontSize: 16, fontWeight: "700" },
  reason: { marginTop: 2, fontSize: 13, fontWeight: "400", color: "#000000" },
  metaRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, fontWeight: "400", color: "#000000" },
  addressRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  lockedHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#000000",
  },
  cancelGap: { marginBottom: space.xl },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevron: { fontSize: 16, fontWeight: "700" },
  medHead: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingBottom: 6 },
  medHeadText: { fontSize: 11, fontWeight: "800", color: "#5B6B76" },
  medLine: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  medSno: { width: 36 },
  medCell: { fontSize: 14, fontWeight: "600" },
  attachRow: {
    marginTop: space.md,
    gap: space.sm,
  },
  detail: { marginTop: 10 },
  detailLabel: { fontSize: 12, fontWeight: "400", color: colors.inkSoft },
  detailValue: { marginTop: 2, fontSize: 15, fontWeight: "400", color: "#000000" },
  body: {
    marginTop: space.sm,
    fontSize: 14,
    lineHeight: 20,
    color: "#000000",
  },
  med: {
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
  },
  medRow: { marginTop: 8 },
  medMeta: {
    marginTop: 2,
    marginLeft: 12,
    fontSize: 12,
    color: colors.inkSoft,
  },
  docRow: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: "#eff6ff",
  },
  docLink: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand,
  },
  muted: {
    marginTop: space.sm,
    fontSize: 14,
    color: colors.inkSoft,
  },
});
