import { useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { withDrTitle } from "@/lib/doctorName";
import { practicePhotoUrl } from "@/lib/media";
import { useCareTheme } from "@/lib/careTheme";
import { PressableScale } from "@/lib/motion";
import { radii, shadows, space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

export type ClinicDoctorCard = {
  key: string;
  item: PracticeListItem;
  doctorUserId?: string;
  doctorName?: string;
};

/** One card per bookable doctor so a second doctor is not hidden behind the first. */
export function clinicDoctorCards(list: PracticeListItem[]): ClinicDoctorCard[] {
  const cards: ClinicDoctorCard[] = [];
  for (const item of list) {
    const docs = (item.members ?? [])
      .filter((m) => m.role === "DOCTOR" || m.role === "PRACTICE_OWNER")
      .sort((a, b) => Number(a.role !== "DOCTOR") - Number(b.role !== "DOCTOR"));
    if (!docs.length) {
      cards.push({ key: item.id, item });
      continue;
    }
    for (const doc of docs) {
      cards.push({
        key: `${item.id}:${doc.userId}`,
        item,
        doctorUserId: doc.userId,
        doctorName: doc.user?.name?.trim() || undefined,
      });
    }
  }
  return cards;
}

/** Doctor / clinic card — photo, specialty, city and a Book visit action. */
export function ClinicCard({
  item,
  doctorUserId,
  doctorName,
}: {
  item: PracticeListItem;
  doctorUserId?: string;
  doctorName?: string;
}) {
  const router = useRouter();
  const { theme } = useCareTheme();
  const doc = doctorName?.trim() || item.name;
  const title = withDrTitle(doc) || item.name;
  const specialty = item.specialties?.length
    ? item.specialties.join(" · ")
    : item.specialty?.trim() || "General physician";
  const city = item.locations?.[0]?.city;
  const open = () =>
    router.push({
      pathname: "/(app)/doctor/[slug]",
      params: {
        slug: item.slug,
        ...(doctorUserId ? { providerId: doctorUserId } : {}),
      },
    } as Href);

  return (
    <PressableScale
      style={[styles.card, { backgroundColor: theme.card }]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${specialty}${city ? `, ${city}` : ""}. Book visit`}
    >
      <View style={styles.row}>
        <ClinicAvatar
          name={doc}
          uri={practicePhotoUrl(item)}
          size={84}
          radius={20}
          backgroundColor={theme.visit}
          textColor={theme.visitInk}
        />
        <View style={styles.body}>
          <Text style={[styles.name, { color: theme.ink }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.specialty, { color: theme.visitInk }]} numberOfLines={2}>
            {specialty}
          </Text>
          {title !== item.name ? (
            <Text style={[styles.clinic, { color: theme.muted }]} numberOfLines={1}>
              {item.name}
            </Text>
          ) : null}
          {city ? (
            <View style={styles.meta}>
              <SvgIcon name="location" size={12} color={theme.muted} />
              <Text style={[styles.metaText, { color: theme.muted }]} numberOfLines={1}>
                {city}
                {item.consultationFee != null ? ` · ₹${item.consultationFee}` : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.bookBtn, { backgroundColor: theme.visit }]}>
        <Text style={[styles.bookText, { color: theme.visitInk }]}>Book Visit</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: space.lg,
    ...shadows.soft,
  },
  row: {
    flexDirection: "row",
    gap: space.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  specialty: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },
  clinic: {
    marginTop: 2,
    fontSize: 12,
  },
  meta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  bookBtn: {
    marginTop: space.md,
    borderRadius: radii.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  bookText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
