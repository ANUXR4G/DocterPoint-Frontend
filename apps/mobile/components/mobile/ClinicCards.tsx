import { useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { withDrTitle } from "@/lib/doctorName";
import { practicePhotoUrl } from "@/lib/media";
import { PressableScale } from "@/lib/motion";
import { colors, radii, shadows, space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

function doctorName(item: PracticeListItem) {
  const doc = item.members?.find((m) => m.role === "DOCTOR");
  return doc?.user?.name?.trim() || item.name;
}

/** Doctor / clinic card — photo, rating, specialty, city and a Book visit action. */
export function ClinicCard({ item }: { item: PracticeListItem }) {
  const router = useRouter();
  const doc = doctorName(item);
  const title = withDrTitle(doc) || item.name;
  const specialty = item.specialties?.length
    ? item.specialties.join(" · ")
    : item.specialty?.trim() || "General physician";
  const city = item.locations?.[0]?.city;
  const rating = item.reviewSummary?.count ? item.reviewSummary.average : null;
  const open = () => router.push(`/(app)/doctor/${item.slug}` as Href);

  return (
    <PressableScale
      style={styles.card}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${specialty}${city ? `, ${city}` : ""}. Book visit`}
    >
      <View style={styles.row}>
        <ClinicAvatar name={doc} uri={practicePhotoUrl(item)} size={84} radius={20} />
        <View style={styles.body}>
          <View style={styles.topLine}>
            <Text style={styles.name} numberOfLines={2}>
              {title}
            </Text>
            {rating != null ? (
              <View style={styles.rating}>
                <SvgIcon name="star" size={11} color={colors.brand} />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.specialty} numberOfLines={2}>
            {specialty}
          </Text>
          {title !== item.name ? (
            <Text style={styles.clinic} numberOfLines={1}>
              {item.name}
            </Text>
          ) : null}
          {city ? (
            <View style={styles.meta}>
              <SvgIcon name="location" size={12} color={colors.inkFaint} />
              <Text style={styles.metaText} numberOfLines={1}>
                {city}
                {item.consultationFee != null ? ` · ₹${item.consultationFee}` : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.bookBtn}>
        <Text style={styles.bookText}>Book Visit</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
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
  topLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brandLight,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
  },
  specialty: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
  },
  clinic: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkSoft,
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
    color: colors.inkFaint,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  bookBtn: {
    marginTop: space.md,
    backgroundColor: colors.brandLight,
    borderRadius: radii.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  bookText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
});
