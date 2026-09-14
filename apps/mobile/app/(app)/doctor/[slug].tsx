import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { StarRating } from "@/components/StarRating";
import { ClinicProfileHero } from "@/components/mobile/ClinicProfileHero";
import {
  Chip,
  EmptyState,
  ErrorText,
  Field,
  HintText,
  Loading,
  Panel,
  Screen,
} from "@/components/ui";
import { VoiceField } from "@/components/VoiceField";
import { api } from "@/lib/api";
import { practicePhotoUrl } from "@/lib/media";
import { colors, radii, space } from "@/lib/theme";
import type { PatientProfile, PracticeReview, ReviewSummary } from "@/lib/types";

type PracticeDetail = {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  consultationFee: number | null;
  bgSrc?: string | null;
  reviewsEnabled?: boolean;
  reviewSummary?: ReviewSummary;
  reviews?: PracticeReview[];
  locations: { id: string; name: string; city: string; address: string }[];
  members: {
    userId: string;
    role: string;
    user?: {
      id: string;
      name: string | null;
      imgSrc?: string | null;
      doctor?: { appointmentValidityDays?: number | null };
    };
  }[];
};

type TimeSlot = {
  start: string | Date;
  end?: string | Date;
  available: boolean;
};

type TokenSession = {
  available: boolean;
  nextToken?: number;
  sessionStart?: string;
  sessionEnd?: string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PracticeBookScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [practice, setPractice] = useState<PracticeDetail | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [date, setDate] = useState(() => ymd(new Date()));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [tokens, setTokens] = useState<TokenSession[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [mode, setMode] = useState<"TIME_BASED" | "TOKEN_BASED" | null>(null);
  const [disease, setDisease] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [phone, setPhone] = useState("");

  const doctors = useMemo(() => {
    if (!practice?.members) return [];
    const docs = practice.members.filter((m) => m.role === "DOCTOR");
    const list = docs.length ? docs : practice.members;
    return list.map((m) => ({
      id: m.userId,
      name: m.user?.name?.trim() || "Doctor",
    }));
  }, [practice]);

  const location = practice?.locations?.[0];

  const dayOptions = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0) return null;
      return {
        value: ymd(d),
        label: d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      };
    }).filter(Boolean) as { value: string; label: string }[];
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      api<PracticeDetail>(`/procto/practices/${slug}`),
      api<PatientProfile>("/patient/profile"),
    ]).then(([pracRes, profileRes]) => {
      setLoading(false);
      if (pracRes.status !== "successful" || !pracRes.data) {
        setError(pracRes.message || "Clinic not found");
        return;
      }
      const p = pracRes.data;
      setPractice(p);
      const docs = (p.members || []).filter((m) => m.role === "DOCTOR");
      const list = docs.length ? docs : p.members || [];
      if (list[0]) setProviderId(list[0].userId);

      const profile = (profileRes.data || profileRes) as PatientProfile;
      const contact =
        profile.contact_number ||
        profile.contactNumber ||
        profile.phone ||
        "";
      setPhone(String(contact).replace(/\D/g, "").slice(-10));
    });
  }, [slug]);

  useEffect(() => {
    if (!practice || !providerId || !location || !date) return;
    setSelectedSlot(null);
    setMode(null);
    const params = new URLSearchParams({
      practiceId: practice.id,
      providerId,
      locationId: location.id,
      date,
    });
    api<{
      timeSlots?: TimeSlot[];
      tokenSessions?: TokenSession[];
      configuredMode?: "TIME_BASED" | "TOKEN_BASED" | null;
      configuredModes?: string[];
    }>(`/procto/bookings/availability?${params}`).then((res) => {
      if (res.status !== "successful") {
        setSlots([]);
        setTokens([]);
        setMode(null);
        setError(res.message || "Could not load available times");
        return;
      }
      setError("");
      const data = res.data;
      const timeSlots = (data?.timeSlots ?? []).filter((s) => s.available);
      const tokenSessions = (data?.tokenSessions ?? []).filter((s) => s.available);
      setSlots(timeSlots);
      setTokens(tokenSessions);
      const resolved =
        data?.configuredMode ??
        (data?.configuredModes?.length === 1
          ? (data.configuredModes[0] as "TIME_BASED" | "TOKEN_BASED")
          : null) ??
        (timeSlots.length && !tokenSessions.length
          ? "TIME_BASED"
          : tokenSessions.length && !timeSlots.length
            ? "TOKEN_BASED"
            : null);
      setMode(resolved);
    });
  }, [practice, providerId, location, date]);

  async function book() {
    if (!practice || !providerId || !location || !mode) return;
    if (!phone || phone.length < 10) {
      setError("Add a contact number on your profile before booking.");
      return;
    }
    if (!disease.trim()) {
      setError("Please describe the problem you want help with.");
      return;
    }
    setBooking(true);
    setError("");
    setMessage("");

    const body: Record<string, unknown> = {
      practiceId: practice.id,
      locationId: location.id,
      providerId,
      patientPhone: phone,
      mode,
      disease: disease.trim(),
      channel: "WEB_PORTAL",
    };
    if (mode === "TIME_BASED") {
      if (!selectedSlot) {
        setBooking(false);
        setError("Pick a time slot.");
        return;
      }
      body.slotStart = selectedSlot;
    } else {
      body.sessionDate = date;
    }

    const res = await api("/procto/bookings", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBooking(false);
    if (res.status !== "successful") {
      setError(res.message || "Booking failed");
      return;
    }
    setMessage("Visit booked. It will show on Home and My visits.");
    setTimeout(() => router.replace("/(app)/appointments"), 800);
  }

  if (loading) return <Loading />;
  if (!practice) {
    return (
      <Screen>
        <ErrorText text={error || "Not found"} />
      </Screen>
    );
  }

  const primaryDoctor = doctors[0]?.name ?? practice.name;
  const reviewCount = practice.reviewSummary?.count ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ClinicProfileHero
          name={practice.name}
          subtitle={`${practice.specialty ?? "General physician"}${
            location ? ` · ${location.city}` : ""
          }${primaryDoctor ? ` · ${primaryDoctor}` : ""}`}
          photoUri={practicePhotoUrl(practice)}
          reviewCount={reviewCount}
          reviewAverage={practice.reviewSummary?.average}
        />

        {practice.reviewSummary && practice.reviewSummary.count > 0 ? (
          <View style={styles.ratingRow}>
            <StarRating
              average={practice.reviewSummary.average}
              count={practice.reviewSummary.count}
            />
          </View>
        ) : null}

        <View style={styles.about}>
          <Text style={styles.aboutTitle}>About clinic</Text>
          <Text style={styles.aboutBody}>
            {location?.address
              ? `${practice.name} at ${location.address}, ${location.city}. `
              : `${practice.name} — `}
            {practice.consultationFee != null
              ? `Consultation from ₹${practice.consultationFee}. `
              : ""}
            Book a slot or token below for your visit.
          </Text>
        </View>

        {practice.reviewsEnabled !== false &&
        (practice.reviews?.length ?? 0) > 0 ? (
          <View style={styles.block}>
            <Text style={styles.label}>Patient reviews</Text>
            {(practice.reviews ?? []).slice(0, 5).map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>
                  {"★".repeat(r.rating)}{" "}
                  <Text style={styles.reviewAuthor}>{r.authorName}</Text>
                </Text>
                {r.body ? (
                  <Text style={styles.reviewBody}>{r.body}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {doctors.length > 1 ? (
          <View style={styles.block}>
            <Text style={styles.label}>Doctor</Text>
            <View style={styles.chips}>
              {doctors.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  active={providerId === d.id}
                  onPress={() => setProviderId(d.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {dayOptions.map((d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  active={date === d.value}
                  onPress={() => setDate(d.value)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {mode === "TIME_BASED" ? (
          <View style={styles.block}>
            <Text style={styles.label}>Available slots</Text>
            {slots.length === 0 ? (
              <EmptyState text="No open slots this day." />
            ) : (
              <View style={styles.chips}>
                {slots.slice(0, 16).map((s) => {
                  const start =
                    typeof s.start === "string"
                      ? s.start
                      : new Date(s.start).toISOString();
                  const label = new Date(start).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <Chip
                      key={start}
                      label={label}
                      active={selectedSlot === start}
                      onPress={() => {
                        setMode("TIME_BASED");
                        setSelectedSlot(start);
                      }}
                    />
                  );
                })}
              </View>
            )}
          </View>
        ) : mode === "TOKEN_BASED" ? (
          <Panel>
            <Text style={styles.tokenTitle}>
              Next token #{tokens[0]?.nextToken ?? "—"}
            </Text>
            <Text style={styles.meta}>
              {tokens[0]?.sessionStart}–{tokens[0]?.sessionEnd} on {date}
            </Text>
            <HintText text="Confirm to take this token for the day." />
          </Panel>
        ) : null}

        <VoiceField
          label="What is the problem?"
          value={disease}
          onChangeText={setDisease}
          placeholder="Describe symptoms, how long, and what you need help with"
          micAriaLabel="Describe your problem by voice"
        />
        <HintText text="Required for the doctor. AI turns this into a short visit brief in their remarks." />

        <ErrorText text={error} />
        {message ? <HintText text={message} /> : null}

        <Pressable
          style={[
            styles.bookCta,
            (booking ||
              !mode ||
              (mode === "TIME_BASED" && !selectedSlot) ||
              (mode === "TOKEN_BASED" && !tokens.length)) &&
              styles.bookCtaDisabled,
          ]}
          onPress={book}
          disabled={
            booking ||
            !mode ||
            (mode === "TIME_BASED" && !selectedSlot) ||
            (mode === "TOKEN_BASED" && !tokens.length)
          }
        >
          <Text style={styles.bookCtaText}>
            {booking ? "Booking…" : "Book appointment"}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48 },
  bookCta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: space.lg,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 4,
  },
  bookCtaText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
  bookCtaDisabled: {
    opacity: 0.45,
  },
  about: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 8,
  },
  aboutBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  block: { marginBottom: space.lg },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ratingRow: { marginBottom: space.lg },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: 2,
  },
  reviewStars: { fontSize: 14, color: "#b45309", fontWeight: "700" },
  reviewAuthor: { color: colors.ink, fontWeight: "600" },
  reviewBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  tokenTitle: { fontWeight: "700", fontSize: 16, color: colors.ink },
  meta: { marginTop: 4, color: colors.inkSoft, fontSize: 13 },
});
