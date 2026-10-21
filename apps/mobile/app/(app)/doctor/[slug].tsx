import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { ClinicProfileHero } from "@/components/mobile/ClinicProfileHero";
import { ScreenHeader } from "@/components/mobile/ScreenHeader";
import { ErrorText, Loading, Screen } from "@/components/ui";
import { VoiceField } from "@/components/VoiceField";
import { api } from "@/lib/api";
import { withDrTitle } from "@/lib/doctorName";
import { practicePhotoUrl } from "@/lib/media";
import { PressableScale } from "@/lib/motion";
import { useCareTheme } from "@/lib/careTheme";
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

function bookingHorizonDays(value?: number | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 90;
  return Math.min(90, Math.floor(n));
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Staff doctors first. The clinic owner is included only with their own doctor profile. */
function listedDoctors(members: PracticeDetail["members"] | undefined) {
  const rows = members ?? [];
  const staff = rows.filter((m) => m.role === "DOCTOR");
  const owners = rows.filter(
    (m) => m.role === "PRACTICE_OWNER" && Boolean(m.user?.doctor),
  );
  return [...staff, ...owners];
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
  const { theme } = useCareTheme();
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
    return listedDoctors(practice?.members).map((m) => ({
      id: m.userId,
      name: m.user?.name?.trim() || "Doctor",
      horizon: bookingHorizonDays(m.user?.doctor?.appointmentValidityDays),
    }));
  }, [practice]);
  const horizonDays =
    doctors.find((d) => d.id === providerId)?.horizon ?? 90;

  const location = practice?.locations?.[0];

  const days = useMemo(() => {
    return Array.from({ length: horizonDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        value: ymd(d),
        dow: d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2).toUpperCase(),
        day: d.getDate(),
        month: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      };
    });
  }, [horizonDays]);
  const lastWeekPage = Math.max(0, Math.ceil(days.length / 7) - 1);
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
      const list = listedDoctors(p.members);
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
      <Screen style={{ backgroundColor: theme.paper }}>
        <ScreenHeader title="Appointment" back />
        <View style={styles.content}>
          <ErrorText text={error || "Not found"} />
        </View>
      </Screen>
    );
  }

  const primaryDoctor = doctors.find((d) => d.id === providerId)?.name ?? doctors[0]?.name;
  const heroName = withDrTitle(primaryDoctor) || practice.name;
  const stats = [
    practice.consultationFee != null
      ? { label: "Fee", value: `₹${practice.consultationFee}` }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const cannotBook =
    booking ||
    !mode ||
    (mode === "TIME_BASED" && !selectedSlot) ||
    (mode === "TOKEN_BASED" && !tokens.length);

  return (
    <Screen style={[styles.screen, { backgroundColor: theme.paper }]}>
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
            <Text style={[styles.blockTitle, { color: theme.ink }]}>Doctor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.row}>
                {doctors.map((d) => {
                  const active = providerId === d.id;
                  const label = withDrTitle(d.name) || d.name;
                  return (
                    <Pressable
                      key={d.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setProviderId(d.id)}
                      style={[
                        styles.choice,
                        { backgroundColor: active ? theme.ink : theme.card },
                      ]}
                    >
                      <Text style={[styles.choiceText, { color: active ? colors.white : theme.ink }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.block}>
          <View style={styles.monthRow}>
            <View>
              <Text style={[styles.blockTitle, { color: theme.ink }]}>{monthLabel}</Text>
              <Text style={[styles.empty, { color: theme.muted }]}>
                You can book any open day in the next {horizonDays} days.
              </Text>
            </View>
            <View style={styles.row}>
              <PressableScale
                style={[styles.arrow, { backgroundColor: theme.card }, weekPage === 0 && styles.arrowOff]}
                disabled={weekPage === 0}
                onPress={() => showWeek(Math.max(0, weekPage - 1))}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <SvgIcon name="chevronLeft" size={16} color={theme.ink} />
              </PressableScale>
              <PressableScale
                style={[styles.arrow, { backgroundColor: theme.card }, weekPage >= lastWeekPage && styles.arrowOff]}
                disabled={weekPage >= lastWeekPage}
                onPress={() => showWeek(Math.min(lastWeekPage, weekPage + 1))}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <SvgIcon name="chevronRight" size={16} color={theme.ink} />
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
                  style={[
                    styles.day,
                    { backgroundColor: active ? theme.ink : theme.card },
                  ]}
                  onPress={() => setDate(d.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${d.dow} ${d.day}`}
                >
                  <Text style={[styles.dayDow, { color: active ? colors.white : theme.muted }]}>{d.dow}</Text>
                  <Text style={[styles.dayNum, { color: active ? colors.white : theme.ink }]}>{d.day}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {mode === "TIME_BASED" ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: theme.ink }]}>Available slots</Text>
            {slots.length === 0 ? (
              <Text style={[styles.empty, { color: theme.muted }]}>No open slots this day.</Text>
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
                      style={[
                        styles.slot,
                        { backgroundColor: active ? theme.ink : theme.card },
                      ]}
                      onPress={() => {
                        setMode("TIME_BASED");
                        setSelectedSlot(start);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.slotText, { color: active ? colors.white : theme.ink }]}>
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
            <Text style={[styles.blockTitle, { color: theme.ink }]}>Token for the day</Text>
            <View style={[styles.tokenCard, { backgroundColor: theme.card }]}>
              <View style={[styles.tokenIcon, { backgroundColor: theme.visit }]}>
                <SvgIcon name="ticket" size={20} color={theme.visitInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tokenTitle, { color: theme.ink }]}>
                  {tokens.length ? `Next token #${tokens[0]?.nextToken ?? "—"}` : "No tokens left"}
                </Text>
                {tokens[0] ? (
                  <Text style={[styles.meta, { color: theme.muted }]}>
                    {tokens[0].sessionStart}–{tokens[0].sessionEnd}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.block}>
            <Text style={[styles.empty, { color: theme.muted }]}>
              No bookings open on this day. Try another date.
            </Text>
          </View>
        )}

        <View style={styles.block}>
          <VoiceField
            label="Chief complaint *"
            value={disease}
            onChangeText={setDisease}
            placeholder="Describe symptoms, how long, and what you need help with"
            micAriaLabel="Describe your problem by voice"
            style={{ backgroundColor: colors.white }}
            micBackground={colors.white}
          />
          <Text style={[styles.hint, { color: theme.muted }]}>
            Required for the doctor.
          </Text>
        </View>

        <View style={[styles.aboutCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.aboutTitle, { color: theme.ink }]}>About the clinic</Text>
          <Text style={[styles.aboutBody, { color: theme.muted }]}>
            {location?.address
              ? `${practice.name} at ${location.address}, ${location.city}.`
              : practice.name}
          </Text>
        </View>

        {practice.reviewsEnabled !== false && (practice.reviews?.length ?? 0) > 0 ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: theme.ink }]}>Patient reviews</Text>
            {(practice.reviews ?? []).slice(0, 5).map((r) => (
              <View key={r.id} style={[styles.reviewCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.reviewAuthor, { color: theme.ink }]}>{r.authorName}</Text>
                {r.body ? <Text style={[styles.reviewBody, { color: theme.muted }]}>{r.body}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md, backgroundColor: theme.paper }]}>
        <ErrorText text={error} />
        {message ? (
          <Text style={[styles.saved, { color: theme.taskInk }]}>{message}</Text>
        ) : null}
        <PressableScale
          style={[
            styles.bookCta,
            { backgroundColor: theme.ink },
            cannotBook && styles.bookCtaOff,
          ]}
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
    letterSpacing: -0.3,
    marginBottom: space.md,
  },
  choice: {
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  choiceText: { fontSize: 14, fontWeight: "600" },
  empty: { fontSize: 14, lineHeight: 20 },
  hint: { marginTop: -4, fontSize: 13, lineHeight: 18 },
  saved: { marginBottom: space.sm, fontSize: 14, fontWeight: "600" },
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
  },
  dayDow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  dayNum: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
  },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.pill,
    ...shadows.soft,
  },
  slotText: { fontSize: 13, fontWeight: "700" },
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderRadius: 26,
    padding: space.lg,
    ...shadows.soft,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tokenTitle: { fontWeight: "700", fontSize: 16 },
  meta: { marginTop: 3, fontSize: 13 },
  aboutCard: {
    marginTop: space.xl,
    borderRadius: 26,
    padding: space.lg,
    ...shadows.soft,
  },
  aboutTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  aboutBody: { fontSize: 14, lineHeight: 21 },
  reviewCard: {
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: 20,
    ...shadows.soft,
  },
  reviewAuthor: { fontWeight: "600" },
  reviewBody: { marginTop: 6, fontSize: 13, lineHeight: 19 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  bookCta: {
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: "center",
  },
  bookCtaOff: { opacity: 0.4 },
  bookCtaText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
