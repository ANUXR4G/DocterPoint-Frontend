import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { StarRating } from "@/components/StarRating";
import { practicePhotoUrl } from "@/lib/media";
import { colors, shadows, radii, space } from "@/lib/theme";
import type { PracticeListItem } from "@/lib/types";

function doctorName(item: PracticeListItem) {
  const doc = item.members?.find((m) => m.role === "DOCTOR");
  return doc?.user?.name?.trim() || item.name;
}

/** Large featured card — home screen. */
export function FeaturedClinicCard({ item }: { item: PracticeListItem }) {
  const doc = doctorName(item);
  const specialty = item.specialty ?? "General physician";
  const city = item.locations?.[0]?.city;
  const photo = practicePhotoUrl(item);

  return (
    <Link href={`/(app)/doctor/${item.slug}` as Href} asChild>
      <Pressable style={styles.featured}>
        <ClinicAvatar name={doc} uri={photo} size={76} radius={radii.lg} />
        <View style={styles.featuredBody}>
          <Text style={styles.featuredKicker}>Recommended</Text>
          <Text style={styles.featuredName} numberOfLines={1}>
            {doc.startsWith("Dr") ? doc : `Dr. ${doc}`}
          </Text>
          <Text style={styles.featuredMeta} numberOfLines={1}>
            {specialty}
            {city ? ` · ${city}` : ""}
          </Text>
          <View style={styles.featuredFooter}>
            <View style={styles.availablePill}>
              <View style={styles.availableDot} />
              <Text style={styles.available}>Open now</Text>
            </View>
            <View style={styles.appointmentBtn}>
              <Text style={styles.appointmentBtnText}>Book</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

/** Full-width list card — clinics search. */
export function ClinicGridCard({ item }: { item: PracticeListItem }) {
  const doc = doctorName(item);
  const specialty = item.specialty ?? "General";
  const city = item.locations?.[0]?.city;
  const photo = practicePhotoUrl(item);
  const title = doc.startsWith("Dr") ? doc : `Dr. ${doc}`;

  return (
    <Link href={`/(app)/doctor/${item.slug}` as Href} asChild>
      <Pressable style={styles.listCard}>
        <ClinicAvatar name={doc} uri={photo} size={64} radius={radii.lg} />
        <View style={styles.listBody}>
          <Text style={styles.listName} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.listMeta} numberOfLines={1}>
            {specialty}
            {city ? ` · ${city}` : ""}
          </Text>
          {item.reviewSummary && item.reviewSummary.count > 0 ? (
            <View style={styles.listRating}>
              <StarRating
                average={item.reviewSummary.average}
                count={item.reviewSummary.count}
                compact
              />
            </View>
          ) : null}
          <View style={styles.listBtn}>
            <Text style={styles.listBtnText}>Book visit</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.brand} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  featured: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    backgroundColor: colors.white,
    borderRadius: radii.xxl,
    padding: space.xl,
    ...shadows.card,
  },
  featuredBody: {
    flex: 1,
    minWidth: 0,
  },
  featuredKicker: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.brand,
    marginBottom: 6,
  },
  featuredName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  featuredMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  featuredFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  availablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  availableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  available: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.success,
  },
  appointmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.navy,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.sm,
  },
  appointmentBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: space.lg,
    ...shadows.soft,
  },
  listBody: {
    flex: 1,
    minWidth: 0,
  },
  listName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  listMeta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  listRating: {
    marginTop: 6,
  },
  listBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandLight,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  listBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.brand,
    letterSpacing: -0.1,
  },
});
