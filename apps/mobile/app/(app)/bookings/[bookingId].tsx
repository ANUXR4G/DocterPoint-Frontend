import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CareChatPanel } from "@/components/CareChatPanel";
import { PracticeReviewForm } from "@/components/PracticeReviewForm";
import {
  ErrorText,
  Loading,
  PageTitle,
  Panel,
  PrimaryButton,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { api } from "@/lib/api";
import {
  bookingStatusLabel,
  bookingStatusTone,
  effectiveBookingStatus,
} from "@/lib/bookingStats";
import { attachPatientVisitDocument } from "@/lib/chat";
import { withDrTitle } from "@/lib/doctorName";
import { usePatientLive } from "@/lib/PatientLiveContext";
import { patchBookingFields } from "@/lib/liveBooking";
import { getSessionUserId } from "@/lib/sessionUser";
import { colors, radii, space } from "@/lib/theme";
import {
  bookingWhen,
  consultationTypeLabel,
  type BookingDetail,
} from "@/lib/types";
import {
  pickVisitDocument,
  pickVisitPhoto,
  uploadVisitFile,
} from "@/lib/visitUpload";

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { bookings: sharedBookings, liveConnected } = usePatientLive();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState("");

  const fromShared = sharedBookings.find((b) => b.id === bookingId) ?? null;

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!bookingId) return;
    const soft = Boolean(opts?.soft);
    if (!soft) {
      setLoading(true);
      setError("");
    }
    const [res, uid] = await Promise.all([
      api<BookingDetail>(`/procto/bookings/${bookingId}`),
      getSessionUserId(),
    ]);
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
      if (!prev) return fromShared as BookingDetail;
      return patchBookingFields(
        prev,
        fromShared as unknown as Record<string, unknown>,
      );
    });
  }, [fromShared]);

  useEffect(() => {
    if (!liveConnected) return;
    void load({ soft: true });
  }, [liveConnected, load]);

  const display = booking ?? (fromShared as BookingDetail | null);

  if (loading && !display) return <Loading />;

  if (!display) {
    return (
      <Screen>
        <View style={styles.content}>
          <ErrorText text={error || "Visit not found."} />
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const displayStatus = effectiveBookingStatus(display);
  const tone = bookingStatusTone(displayStatus);
  const isCompleted = display.status === "COMPLETED";
  const practiceId = display.practiceId ?? display.practice?.id ?? null;
  const canReview =
    isCompleted && display.reviewEligibility?.canReview === true;
  const alreadyReviewed =
    isCompleted && display.reviewEligibility?.alreadyReviewed === true;
  const medicines = Array.isArray(display.medicines) ? display.medicines : [];
  const documents = Array.isArray(display.documents) ? display.documents : [];
  const canAttachDocs =
    displayStatus !== "CANCELED" && displayStatus !== "NO_SHOW";
  const showVisitSummary =
    isCompleted ||
    Boolean(display.doctorRemarks?.trim()) ||
    medicines.length > 0;

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Text style={styles.back}>← My visits</Text>
        </Pressable>

        <PageTitle
          title={display.practice?.name || "Clinic visit"}
          subtitle={
            liveConnected
              ? `${bookingWhen(display)} · Live`
              : bookingWhen(display)
          }
        />

        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusText, { color: tone.fg }]}>
            {bookingStatusLabel(displayStatus)}
          </Text>
        </View>

        {isCompleted ? (
          <Text style={styles.lockedHint}>
            This visit is finished and cannot be canceled or rescheduled.
          </Text>
        ) : null}

        <Panel style={styles.panel}>
          <SectionTitle>Visit details</SectionTitle>
          <Detail label="Doctor" value={withDrTitle(display.provider?.name) || "—"} />
          <Detail
            label="Location"
            value={
              display.location
                ? `${display.location.name}, ${display.location.city}`
                : "—"
            }
          />
          <Detail
            label="Reason"
            value={
              display.disease ||
              consultationTypeLabel(display.consultationType) ||
              "—"
            }
          />
        </Panel>

        {showVisitSummary ? (
          <>
            <Panel style={styles.panel}>
              <SectionTitle>Doctor remarks</SectionTitle>
              {display.doctorRemarks?.trim() ? (
                <Text style={styles.body}>{display.doctorRemarks}</Text>
              ) : (
                <Text style={styles.muted}>No remarks from the doctor yet.</Text>
              )}
            </Panel>

            <Panel style={styles.panel}>
              <SectionTitle>Medicines</SectionTitle>
              {medicines.length === 0 ? (
                <Text style={styles.muted}>No medicines prescribed.</Text>
              ) : (
                medicines.map((m, idx) => (
                  <View key={`${m.name}-${idx}`} style={styles.medRow}>
                    <Text style={styles.med}>• {m.name}</Text>
                    <Text style={styles.medMeta}>
                      {[m.amount, m.times?.length ? m.times.join(", ") : ""]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                  </View>
                ))
              )}
            </Panel>
          </>
        ) : null}

        <Panel style={styles.panel}>
          <SectionTitle>Documents</SectionTitle>
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
        </Panel>

        {selfUserId && display.provider?.id ? (
          <CareChatPanel
            selfUserId={selfUserId}
            peerUserId={display.provider.id}
            peerName={
              display.provider.name
                ? `Dr. ${display.provider.name.trim().replace(/^(?:dr\.\s*|dr\s+)+/i, "")}`
                : "Doctor"
            }
            subtitle="Doctor messages also arrive on WhatsApp. Attach reports with Photo or File below. Do not use this for emergencies."
            bookingId={display.id}
            threadSince={display.createdAt ?? display.created_at ?? null}
            onDocumentAttached={() => void load({ soft: true })}
          />
        ) : null}

        {isCompleted && practiceId ? (
          <Panel style={styles.panel}>
            <SectionTitle>Your review</SectionTitle>
            {alreadyReviewed ? (
              <Text style={styles.thanks}>
                Thank you — your review has been submitted and appears on the
                clinic&apos;s Find Care profile.
              </Text>
            ) : canReview ? (
              <PracticeReviewForm
                practiceId={practiceId}
                bookingId={display.id}
                defaultAuthorName={display.patientName ?? ""}
                providerName={display.provider?.name}
                onSubmitted={() => void load()}
              />
            ) : (
              <Text style={styles.muted}>
                Reviews are not available for this visit.
              </Text>
            )}
          </Panel>
        ) : null}
      </ScrollView>
    </Screen>
  );
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
  content: { padding: space.lg, paddingBottom: 48 },
  backRow: { marginBottom: space.md },
  back: {
    color: colors.brand,
    fontWeight: "700",
    fontSize: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: space.lg,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  lockedHint: {
    marginTop: -space.md,
    marginBottom: space.lg,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  panel: { marginBottom: space.md },
  attachRow: {
    marginTop: space.md,
    gap: space.sm,
  },
  detail: { marginTop: space.sm },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  body: {
    marginTop: space.sm,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  med: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
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
  thanks: {
    marginTop: space.sm,
    fontSize: 14,
    lineHeight: 20,
    color: "#047857",
  },
  muted: {
    marginTop: space.sm,
    fontSize: 14,
    color: colors.inkSoft,
  },
});
