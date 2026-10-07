import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgIcon, type SvgIconName } from "@/components/icons/SvgIcon";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { AnimatedView, PressableScale } from "@/lib/motion";
import {
  bookingStatusLabel,
  bookingStatusTone,
  effectiveBookingStatus,
  getClinicCount,
  getCompletedBookings,
  getUpcomingBookings,
  latestPrescription,
  sortBookingsByWhen,
  visitCountdown,
  visitDayTime,
} from "@/lib/bookingStats";
import { withDrTitle } from "@/lib/doctorName";
import { colors, radii, shadows, space } from "@/lib/theme";
import { bookingWhen, type ProctoBooking } from "@/lib/types";

type Props = {
  bookings: ProctoBooking[];
  /** First load still running (show placeholders instead of zeros). */
  loading: boolean;
};

function doctorLine(b: ProctoBooking) {
  return withDrTitle(b.provider?.name || b.providerName) || "Doctor to be assigned";
}

/** Patient dashboard (mirrors web /patient/dashboard): next visit, quick actions, summary, medicines. */
export function PatientDashboard({ bookings, loading }: Props) {
  const router = useRouter();
  const upcoming = useMemo(() => getUpcomingBookings(bookings), [bookings]);
  const completed = useMemo(() => getCompletedBookings(bookings), [bookings]);
  const clinics = useMemo(() => getClinicCount(bookings), [bookings]);
  const prescription = useMemo(() => latestPrescription(bookings), [bookings]);
  const latest = useMemo(() => sortBookingsByWhen(bookings, "desc")[0], [bookings]);
  const nextVisit = upcoming[0];
  const later = upcoming.slice(1, 4);
  const placeholder = loading && bookings.length === 0;

  const openVisit = (id: string) => router.push(`/(app)/bookings/${id}` as Href);
  const openVisits = () => router.push("/(app)/appointments");
  const openClinics = () => router.push("/(app)/doctors");

  const actions: { label: string; icon: SvgIconName; onPress: () => void }[] = [
    { label: "Book", icon: "addCircle", onPress: openClinics },
    {
      label: "Chat",
      icon: "chatOutline",
      onPress: () => {
        const target = nextVisit ?? latest;
        if (target) openVisit(target.id);
        else router.push("/(app)/queries");
      },
    },
    {
      label: "Calendar",
      icon: "calendarOutline",
      onPress: () => router.push("/(app)/record"),
    },
    {
      label: "Rx",
      icon: "medkitOutline",
      onPress: () => (prescription ? openVisit(prescription.booking.id) : openVisits()),
    },
  ];

  const summary: {
    label: string;
    value: string;
    icon: SvgIconName;
    tint: string;
    bg: string;
    onPress: () => void;
  }[] = [
    {
      label: "Upcoming",
      value: placeholder ? "—" : String(upcoming.length),
      icon: "clock",
      tint: colors.brand,
      bg: colors.brandLight,
      onPress: openVisits,
    },
    {
      label: "Completed",
      value: placeholder ? "—" : String(completed.length),
      icon: "checkDone",
      tint: colors.success,
      bg: colors.emeraldLight,
      onPress: openVisits,
    },
    {
      label: "Clinics",
      value: placeholder ? "—" : String(clinics),
      icon: "business",
      tint: colors.rose,
      bg: colors.roseLight,
      onPress: openClinics,
    },
  ];

  return (
    <View>
      {nextVisit ? (
        <AnimatedView from="up" delay={40}>
          <UpcomingCard
            booking={nextVisit}
            onOpen={() => openVisit(nextVisit.id)}
            onAll={openVisits}
          />
        </AnimatedView>
      ) : !placeholder ? (
        <AnimatedView from="up" delay={40} style={styles.card}>
          <Text style={styles.overline}>Upcoming appointment</Text>
          <Text style={styles.emptyTitle}>No visits booked</Text>
          <Text style={styles.emptyBody}>
            Book a clinic and your next visit shows up here with reminders.
          </Text>
          <PressableScale style={[styles.primaryBtn, styles.emptyBtn]} onPress={openClinics}>
            <Text style={styles.primaryText}>Book a visit</Text>
          </PressableScale>
        </AnimatedView>
      ) : null}

      <AnimatedView from="up" delay={90} style={styles.actions}>
        {actions.map((a) => (
          <PressableScale
            key={a.label}
            style={styles.action}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <View style={styles.actionIcon}>
              <SvgIcon name={a.icon} size={24} color={colors.brand} />
            </View>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </PressableScale>
        ))}
      </AnimatedView>

      <AnimatedView from="up" delay={130} style={styles.section}>
        <SectionHead title="Health summary" action="See all" onAction={openVisits} />
        <View style={styles.summary}>
          {summary.map((s) => (
            <PressableScale
              key={s.label}
              wrapStyle={styles.grow}
              style={styles.summaryTile}
              onPress={s.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}: ${s.value}`}
            >
              <View style={[styles.summaryIcon, { backgroundColor: s.bg }]}>
                <SvgIcon name={s.icon} size={16} color={s.tint} />
              </View>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {s.value}
              </Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </PressableScale>
          ))}
        </View>
      </AnimatedView>

      {later.length ? (
        <AnimatedView from="up" delay={160} style={styles.section}>
          <SectionHead
            title="Coming up"
            action={upcoming.length > 4 ? `+${upcoming.length - 4} more` : "All"}
            onAction={openVisits}
          />
          <View style={styles.list}>
            {later.map((b) => (
              <VisitRow key={b.id} booking={b} onPress={() => openVisit(b.id)} />
            ))}
          </View>
        </AnimatedView>
      ) : null}

      {prescription ? (
        <AnimatedView from="up" delay={200} style={styles.section}>
          <SectionHead
            title="Your medicines"
            action="Open visit"
            onAction={() => openVisit(prescription.booking.id)}
          />
          <PressableScale
            style={styles.card}
            onPress={() => openVisit(prescription.booking.id)}
            accessibilityRole="button"
            accessibilityLabel="Open the visit with this prescription"
          >
            <Text style={styles.medFrom} numberOfLines={1}>
              {doctorLine(prescription.booking)} ·{" "}
              {prescription.booking.practice?.name || "Clinic"} ·{" "}
              {bookingWhen(prescription.booking)}
            </Text>
            <View style={styles.medList}>
              {prescription.medicines.slice(0, 4).map((m, i) => (
                <View key={`${m.name}-${i}`} style={styles.medRow}>
                  <View style={styles.medDot}>
                    <SvgIcon name="medkitOutline" size={14} color={colors.brand} />
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
            </View>
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

export function SectionHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <PressableScale style={styles.sectionAction} onPress={onAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <SvgIcon name="chevronRight" size={14} color={colors.brand} />
        </PressableScale>
      ) : null}
    </View>
  );
}

function UpcomingCard({
  booking,
  onOpen,
  onAll,
}: {
  booking: ProctoBooking;
  onOpen: () => void;
  onAll: () => void;
}) {
  const displayStatus = effectiveBookingStatus(booking);
  const tone = bookingStatusTone(displayStatus);
  const doctor = doctorLine(booking);
  const clinic = booking.practice?.name || "Clinic visit";
  const specialty = booking.practice?.specialty?.trim();
  const countdown = visitCountdown(booking);
  const sameAsDoctor =
    clinic.replace(/^Dr\.?\s*/i, "").toLowerCase() ===
    doctor.replace(/^Dr\.?\s*/i, "").toLowerCase();
  const meta = [specialty, sameAsDoctor ? null : clinic].filter(Boolean).join(" · ");

  return (
    <View style={[styles.card, { borderLeftColor: tone.fg, borderLeftWidth: 4 }]}>
      <View style={styles.cardTop}>
        <Text style={styles.overline}>Upcoming appointment</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusText, { color: tone.fg }]}>
            {bookingStatusLabel(displayStatus)}
          </Text>
        </View>
      </View>

      <View style={styles.doctorRow}>
        <ClinicAvatar name={doctor.replace(/^Dr\.?\s*/i, "")} size={56} radius={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.doctorName} numberOfLines={1}>
            {doctor}
          </Text>
          <Text style={styles.doctorMeta} numberOfLines={1}>
            {meta || clinic}
          </Text>
        </View>
      </View>

      <View style={styles.timeBox}>
        <View style={styles.timeIcon}>
          <SvgIcon name="calendar" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.timeMain} numberOfLines={1}>
            {visitDayTime(booking)}
          </Text>
          {countdown ? <Text style={styles.timeSub}>{countdown}</Text> : null}
        </View>
      </View>

      <View style={styles.btnRow}>
        <PressableScale
          wrapStyle={styles.grow}
          style={styles.primaryBtn}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="View visit details"
        >
          <Text style={styles.primaryText}>View visit</Text>
        </PressableScale>
        <PressableScale
          wrapStyle={styles.grow}
          style={styles.secondaryBtn}
          onPress={onAll}
          accessibilityRole="button"
          accessibilityLabel="All bookings"
        >
          <Text style={styles.secondaryText}>All bookings</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function VisitRow({ booking, onPress }: { booking: ProctoBooking; onPress: () => void }) {
  const displayStatus = effectiveBookingStatus(booking);
  const tone = bookingStatusTone(displayStatus);
  const clinic = booking.practice?.name || "Clinic visit";
  return (
    <PressableScale
      style={[styles.visit, { borderLeftColor: tone.fg, borderLeftWidth: 4 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${clinic}, ${visitDayTime(booking)}, ${bookingStatusLabel(displayStatus)}`}
    >
      <View style={styles.visitIcon}>
        <SvgIcon name="calendarOutline" size={18} color={tone.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.visitClinic} numberOfLines={1}>
          {clinic}
        </Text>
        <Text style={styles.visitMeta} numberOfLines={1}>
          {visitDayTime(booking)} · {doctorLine(booking)}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusText, { color: tone.fg }]}>
          {bookingStatusLabel(displayStatus)}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: space.xl,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  overline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.brand,
  },
  statusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  doctorRow: {
    marginTop: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  doctorName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  doctorMeta: {
    marginTop: 3,
    fontSize: 13,
    color: colors.inkSoft,
  },
  timeBox: {
    marginTop: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.sky100,
    borderRadius: 20,
    padding: 14,
  },
  timeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  timeMain: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  timeSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  btnRow: {
    marginTop: space.lg,
    flexDirection: "row",
    gap: space.md,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: 15,
    alignItems: "center",
    ...shadows.brand,
  },
  primaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    backgroundColor: colors.sky100,
    borderRadius: radii.pill,
    paddingVertical: 15,
    alignItems: "center",
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyTitle: {
    marginTop: space.md,
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSoft,
  },
  emptyBtn: {
    marginTop: space.lg,
  },
  actions: {
    marginTop: space.xl,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  action: {
    alignItems: "center",
    width: 72,
  },
  actionIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  actionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
  },
  section: {
    marginTop: space.xxl,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  summary: {
    flexDirection: "row",
    gap: space.md,
  },
  summaryTile: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: space.md,
    ...shadows.soft,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: {
    marginTop: space.sm,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  summaryLabel: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "500",
    color: colors.inkSoft,
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
    padding: space.md,
    ...shadows.soft,
  },
  visitIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  visitClinic: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  visitMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
  },
  medFrom: {
    fontSize: 12,
    color: colors.inkFaint,
  },
  medList: {
    marginTop: space.md,
    gap: space.md,
  },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  medDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandLight,
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
    color: colors.brand,
  },
  medMore: {
    marginTop: space.md,
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
  },
});
