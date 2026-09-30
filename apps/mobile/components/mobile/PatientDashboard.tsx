import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedView, PressableScale } from "@/lib/motion";
import {
  bookingStatusLabel,
  bookingStatusTone,
  getClinicCount,
  getCompletedBookings,
  getUpcomingBookings,
  latestPrescription,
  nextVisitLabel,
} from "@/lib/bookingStats";
import { withDrTitle } from "@/lib/doctorName";
import { colors, radii, shadows, space, type } from "@/lib/theme";
import { bookingWhen, type ProctoBooking } from "@/lib/types";

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  bookings: ProctoBooking[];
  /** First load still running (show placeholders instead of zeros). */
  loading: boolean;
};

function doctorLine(b: ProctoBooking) {
  return withDrTitle(b.provider?.name || b.providerName) || "Doctor to be assigned";
}

/** Patient dashboard (mirrors web /patient/dashboard): stats, next visit, upcoming list, current medicines. */
export function PatientDashboard({ bookings, loading }: Props) {
  const router = useRouter();
  const upcoming = useMemo(() => getUpcomingBookings(bookings), [bookings]);
  const completed = useMemo(() => getCompletedBookings(bookings), [bookings]);
  const clinics = useMemo(() => getClinicCount(bookings), [bookings]);
  const prescription = useMemo(() => latestPrescription(bookings), [bookings]);
  const nextVisit = upcoming[0];
  const later = upcoming.slice(1, 4);
  const placeholder = loading && bookings.length === 0;

  const openVisit = (id: string) => router.push(`/(app)/bookings/${id}` as Href);
  const openVisits = () => router.push("/(app)/appointments");
  const openClinics = () => router.push("/(app)/doctors");

  const stats: {
    label: string;
    value: string;
    hint: string;
    icon: IconName;
    tint: string;
    bg: string;
    onPress: () => void;
  }[] = [
    {
      label: "Upcoming",
      value: placeholder ? "—" : String(upcoming.length),
      hint: "Active bookings",
      icon: "calendar-outline",
      tint: colors.brand,
      bg: colors.brandLight,
      onPress: openVisits,
    },
    {
      label: "Completed",
      value: placeholder ? "—" : String(completed.length),
      hint: "Past visits",
      icon: "checkmark-done-outline",
      tint: colors.success,
      bg: colors.emeraldLight,
      onPress: openVisits,
    },
    {
      label: "Clinics",
      value: placeholder ? "—" : String(clinics),
      hint: "Visited",
      icon: "business-outline",
      tint: colors.rose,
      bg: colors.roseLight,
      onPress: openClinics,
    },
    {
      label: "Next visit",
      value: placeholder ? "—" : nextVisit ? nextVisitLabel(nextVisit) : "None",
      hint: nextVisit ? nextVisit.practice?.name || "Clinic" : "Book a clinic",
      icon: "time-outline",
      tint: "#b45309",
      bg: colors.amberLight,
      onPress: () => (nextVisit ? openVisit(nextVisit.id) : openClinics()),
    },
  ];

  return (
    <View>
      <AnimatedView from="up" delay={20}>
        <Text style={styles.eyebrow}>Patient dashboard</Text>
        <Text style={styles.title}>Your care at a glance</Text>
      </AnimatedView>

      <AnimatedView from="up" delay={60} style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statCell}>
            <PressableScale
              style={styles.stat}
              onPress={s.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}: ${s.value}. ${s.hint}`}
            >
              <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                <Ionicons name={s.icon} size={16} color={s.tint} />
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text style={styles.statHint} numberOfLines={1}>
                {s.hint}
              </Text>
            </PressableScale>
          </View>
        ))}
      </AnimatedView>

      {nextVisit ? (
        <AnimatedView from="up" delay={120} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>Next up</Text>
            <PressableScale onPress={openVisits}>
              <Text style={styles.sectionAction}>All visits</Text>
            </PressableScale>
          </View>
          <VisitRow booking={nextVisit} featured onPress={() => openVisit(nextVisit.id)} />
        </AnimatedView>
      ) : null}

      {later.length ? (
        <AnimatedView from="up" delay={160} style={styles.section}>
          <Text style={[styles.sectionLabel, styles.sectionLabelGap]}>Later</Text>
          <View style={styles.list}>
            {later.map((b) => (
              <VisitRow key={b.id} booking={b} onPress={() => openVisit(b.id)} />
            ))}
          </View>
          {upcoming.length > 4 ? (
            <PressableScale style={styles.moreBtn} onPress={openVisits}>
              <Text style={styles.moreText}>
                +{upcoming.length - 4} more upcoming · View all
              </Text>
            </PressableScale>
          ) : null}
        </AnimatedView>
      ) : null}

      {prescription ? (
        <AnimatedView from="up" delay={200} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>Your medicines</Text>
            <PressableScale onPress={() => openVisit(prescription.booking.id)}>
              <Text style={styles.sectionAction}>Open visit</Text>
            </PressableScale>
          </View>
          <PressableScale
            style={styles.medCard}
            onPress={() => openVisit(prescription.booking.id)}
            accessibilityRole="button"
            accessibilityLabel="Open the visit with this prescription"
          >
            <Text style={styles.medFrom} numberOfLines={1}>
              {doctorLine(prescription.booking)} ·{" "}
              {prescription.booking.practice?.name || "Clinic"} ·{" "}
              {bookingWhen(prescription.booking)}
            </Text>
            {prescription.medicines.slice(0, 4).map((m, i) => (
              <View key={`${m.name}-${i}`} style={styles.medRow}>
                <View style={styles.medDot}>
                  <Ionicons name="medkit-outline" size={13} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName} numberOfLines={1}>
                    {m.name.trim()}
                    {m.amount?.trim() ? (
                      <Text style={styles.medAmount}> · {m.amount.trim()}</Text>
                    ) : null}
                  </Text>
                  {m.times?.length ? (
                    <Text style={styles.medTimes} numberOfLines={1}>
                      {m.times.join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {prescription.medicines.length > 4 ? (
              <Text style={styles.medMore}>
                +{prescription.medicines.length - 4} more in the visit
              </Text>
            ) : null}
          </PressableScale>
        </AnimatedView>
      ) : null}
    </View>
  );
}

function VisitRow({
  booking,
  featured,
  onPress,
}: {
  booking: ProctoBooking;
  featured?: boolean;
  onPress: () => void;
}) {
  const tone = bookingStatusTone(booking.status);
  const clinic = booking.practice?.name || "Clinic visit";
  return (
    <PressableScale
      style={[styles.visit, featured && styles.visitFeatured]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${clinic}, ${bookingWhen(booking)}, ${bookingStatusLabel(booking.status)}`}
    >
      {featured ? <View style={styles.visitAccent} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.visitClinic} numberOfLines={1}>
          {clinic}
        </Text>
        <Text style={styles.visitMeta} numberOfLines={1}>
          {doctorLine(booking)}
        </Text>
        <Text style={styles.visitWhen} numberOfLines={1}>
          {bookingWhen(booking)}
        </Text>
      </View>
      <View style={styles.visitRight}>
        <View style={[styles.badge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.badgeText, { color: tone.fg }]}>
            {bookingStatusLabel(booking.status)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...type.overline,
    color: colors.inkFaint,
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  grid: {
    marginTop: space.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
  },
  statCell: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  stat: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.lg,
    ...shadows.soft,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  statValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  statHint: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkFaint,
  },
  section: {
    marginTop: space.xl,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  sectionLabel: {
    ...type.overline,
    color: colors.inkFaint,
  },
  sectionLabelGap: {
    marginBottom: space.md,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  list: {
    gap: space.sm,
  },
  visit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.lg,
    overflow: "hidden",
    ...shadows.soft,
  },
  visitFeatured: {
    borderRadius: radii.xl,
    paddingLeft: space.lg + 4,
  },
  visitAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  visitClinic: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  visitMeta: {
    marginTop: 3,
    fontSize: 13,
    color: colors.inkSoft,
  },
  visitWhen: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "500",
    color: colors.ink,
  },
  visitRight: {
    alignItems: "flex-end",
    gap: space.sm,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  moreBtn: {
    marginTop: space.sm,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  moreText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  medCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: space.md,
    ...shadows.soft,
  },
  medFrom: {
    fontSize: 12,
    color: colors.inkFaint,
  },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  medDot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.emeraldLight,
    alignItems: "center",
    justifyContent: "center",
  },
  medName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  medAmount: {
    fontWeight: "400",
    color: colors.inkSoft,
  },
  medTimes: {
    marginTop: 2,
    fontSize: 12,
    color: colors.accent,
  },
  medMore: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
});
