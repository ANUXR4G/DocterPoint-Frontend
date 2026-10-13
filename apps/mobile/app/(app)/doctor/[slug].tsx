import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { StarRating } from "@/components/StarRating";
import { ClinicProfileHero } from "@/components/mobile/ClinicProfileHero";
import { ScreenHeader } from "@/components/mobile/ScreenHeader";
import {
  Chip,
  EmptyState,
  ErrorText,
  HintText,
  Loading,
  Screen,
} from "@/components/ui";
import { VoiceField } from "@/components/VoiceField";
import { api } from "@/lib/api";
import { withDrTitle } from "@/lib/doctorName";
import { practicePhotoUrl } from "@/lib/media";
import { PressableScale } from "@/lib/motion";
import { colors, radii, shadows, space } from "@/lib/theme";
import { formatPracticeTime } from "@/lib/practiceTime";
import type { PatientProfile, PracticeReview, ReviewSummary } from "@/lib/types";

type PracticeDetail = {
  id: string;
  name: string;
  slug: string;
  type?: string;
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
  const { slug, providerId: requestedProvider } = useLocalSearchParams<{
    slug: string;
    providerId?: string;
  }>();
  const requestedId = Array.isArray(requestedProvider)
    ? requestedProvider[0]
    : requestedProvider;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const slotWidth = Math.floor((windowWidth - space.xl * 2 - 20) / 3);
  const [practice, setPractice] = useState<PracticeDetail | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return ymd(d);
  });
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
  const [weekPage, setWeekPage] = useState(0);

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

  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        value: ymd(d),
        dow: d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2).toUpperCase(),
        day: d.getDate(),
        month: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      };
    });
  }, []);
  const visibleDays = days.slice(weekPage * 7, weekPage * 7 + 7);
  const monthLabel =
    (visibleDays.find((d) => d.value === date) ?? visibleDays[0])?.month ?? "";

  function showWeek(page: number) {
    setWeekPage(page);
    const first = days[page * 7];
    if (first && !days.slice(page * 7, page * 7 + 7).some((d) => d.value === date)) {
      setDate(first.value);
    }
  }

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
      const preferred = list.find((m) => m.userId === requestedId) ?? list[0];
      if (preferred) setProviderId(preferred.userId);

      const profile = (profileRes.data || profileRes) as PatientProfile;
      const contact =
        profile.contact_number ||
        profile.contactNumber ||
        profile.phone ||
        "";
      setPhone(String(contact).replace(/\D/g, "").slice(-10));
    });
  }, [slug, requestedId]);

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
        <ScreenHeader title="Appointment" back />
        <View style={styles.content}>
          <ErrorText text={error || "Not found"} />
        </View>
      </Screen>
    );
  }

  const primaryDoctor = doctors.find((d) => d.id === providerId)?.name ?? doctors[0]?.name;
  const heroName = withDrTitle(primaryDoctor) || practice.name;
  const reviewCount = practice.reviewSummary?.count ?? 0;
  const reviewAverage = practice.reviewSummary?.average;
  const stats = [
    practice.consultationFee != null
      ? { label: "Fee", value: `₹${practice.consultationFee}` }
      : null,
    reviewCount > 0 && reviewAverage != null
      ? { label: "Rating", value: reviewAverage.toFixed(1) }
      : null,
    reviewCount > 0 ? { label: "Reviews", value: String(reviewCount) } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const cannotBook =
    booking ||
    !mode ||
    (mode === "TIME_BASED" && !selectedSlot) ||
    (mode === "TOKEN_BASED" && !tokens.length);

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title="Appointment" back />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 150 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ClinicProfileHero
          name={heroName}
          specialty={practice.specialty?.trim() || "General physician"}
          detail={heroName !== practice.name
            ? `${practice.name}${location?.city ? ` · ${location.city}` : ""}`
            : location?.city}
          photoUri={practicePhotoUrl(practice)}
          stats={stats}
        />

        {doctors.length > 1 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Doctor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.row}>
                {doctors.map((d) => (
                  <Chip
                    key={d.id}
                    label={withDrTitle(d.name) || d.name}
                    active={providerId === d.id}
                    onPress={() => setProviderId(d.id)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.block}>
          <View style={styles.monthRow}>
            <Text style={styles.blockTitle}>{monthLabel}</Text>
            <View style={styles.row}>
              <PressableScale
                style={[styles.arrow, weekPage === 0 && styles.arrowOff]}
                disabled={weekPage === 0}
                onPress={() => showWeek(0)}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <SvgIcon name="chevronLeft" size={16} color={colors.inkSoft} />
              </PressableScale>
              <PressableScale
                style={[styles.arrow, weekPage === 1 && styles.arrowOff]}
                disabled={weekPage === 1}
                onPress={() => showWeek(1)}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <SvgIcon name="chevronRight" size={16} color={colors.inkSoft} />
              </PressableScale>
            </View>
          </View>
          <View style={styles.week}>
            {visibleDays.map((d) => {
              const active = date === d.value;
              return (
                <PressableScale
                  key={d.value}
                  wrapStyle={styles.grow}
                  style={[styles.day, active && styles.dayActive]}
                  onPress={() => setDate(d.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${d.dow} ${d.day}`}
                >
                  <Text style={[styles.dayDow, active && styles.dayTextActive]}>{d.dow}</Text>
                  <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.day}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {mode === "TIME_BASED" ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Available slots</Text>
            {slots.length === 0 ? (
              <EmptyState text="No open slots this day." />
            ) : (
              <View style={styles.slots}>
                {slots.map((s) => {
                  const start =
                    typeof s.start === "string" ? s.start : new Date(s.start).toISOString();
                  const active = selectedSlot === start;
                  return (
                    <PressableScale
                      key={start}
                      wrapStyle={{ width: slotWidth }}
                      style={[styles.slot, active && styles.slotActive]}
                      onPress={() => {
                        setMode("TIME_BASED");
                        setSelectedSlot(start);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.slotText, active && styles.slotTextActive]}>
                        {formatPracticeTime(start)}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </View>
        ) : mode === "TOKEN_BASED" ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Token for the day</Text>
            <View style={styles.tokenCard}>
              <View style={styles.tokenIcon}>
                <SvgIcon name="ticket" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tokenTitle}>
                  {tokens.length ? `Next token #${tokens[0]?.nextToken ?? "—"}` : "No tokens left"}
                </Text>
                {tokens[0] ? (
                  <Text style={styles.meta}>
                    {tokens[0].sessionStart}–{tokens[0].sessionEnd}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.block}>
            <EmptyState text="No bookings open on this day. Try another date." />
          </View>
        )}

        <View style={styles.block}>
          <VoiceField
            label="Reason for visit"
            value={disease}
            onChangeText={setDisease}
            placeholder="Describe symptoms, how long, and what you need help with"
            micAriaLabel="Describe your problem by voice"
          />
          <HintText text="Required for the doctor. AI turns this into a short visit brief in their remarks." />
        </View>

        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>About the clinic</Text>
          <Text style={styles.aboutBody}>
            {location?.address
              ? `${practice.name} at ${location.address}, ${location.city}.`
              : practice.name}
          </Text>
        </View>

        {practice.reviewsEnabled !== false && (practice.reviews?.length ?? 0) > 0 ? (
          <View style={styles.block}>
            <View style={styles.monthRow}>
              <Text style={styles.blockTitle}>Patient reviews</Text>
              {reviewCount > 0 ? (
                <StarRating average={practice.reviewSummary?.average ?? null} count={reviewCount} compact />
              ) : null}
            </View>
            {(practice.reviews ?? []).slice(0, 5).map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>
                  {"★".repeat(r.rating)} <Text style={styles.reviewAuthor}>{r.authorName}</Text>
                </Text>
                {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <ErrorText text={error} />
        {message ? <HintText text={message} /> : null}
        <PressableScale
          style={styles.bookCta}
          onPress={book}
          disabled={cannotBook}
          accessibilityRole="button"
        >
          <Text style={styles.bookCtaText}>
            {booking ? "Booking…" : "Confirm Appointment"}
          </Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  content: { paddingHorizontal: space.xl, paddingTop: space.sm },
  block: { marginTop: space.xl },
  blockTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: space.md,
  },
  row: { flexDirection: "row", gap: space.sm },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
    ...shadows.soft,
  },
  arrowOff: { opacity: 0.4 },
  week: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  grow: { flex: 1 },
  day: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
  },
  dayActive: {
    backgroundColor: colors.brand,
    paddingVertical: 18,
    marginVertical: -6,
    ...shadows.brand,
  },
  dayDow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: colors.inkFaint,
  },
  dayNum: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  dayTextActive: { color: colors.white },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  slotActive: { backgroundColor: colors.brand, ...shadows.brand },
  slotText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  slotTextActive: { color: colors.white },
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    ...shadows.soft,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenTitle: { fontWeight: "700", fontSize: 16, color: colors.ink },
  meta: { marginTop: 3, color: colors.inkSoft, fontSize: 13 },
  aboutCard: {
    marginTop: space.xl,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    ...shadows.soft,
  },
  aboutTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  aboutBody: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  reviewCard: {
    backgroundColor: colors.white,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: radii.lg,
    ...shadows.soft,
  },
  reviewStars: { fontSize: 14, color: "#b45309", fontWeight: "700" },
  reviewAuthor: { color: colors.ink, fontWeight: "600" },
  reviewBody: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...shadows.card,
  },
  bookCta: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: 18,
    alignItems: "center",
    ...shadows.brand,
  },
  bookCtaText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
