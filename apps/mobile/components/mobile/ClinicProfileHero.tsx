import { StyleSheet, Text, View } from "react-native";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  name: string;
  subtitle: string;
  photoUri?: string | null;
  reviewAverage?: number | null;
  reviewCount?: number;
};

export function ClinicProfileHero({
  name,
  subtitle,
  photoUri,
  reviewAverage,
  reviewCount = 0,
}: Props) {
  return (
    <View style={styles.wrap}>
      <ClinicAvatar
        name={name}
        uri={photoUri}
        size={96}
        radius={radii.pill}
        style={styles.avatar}
      />
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {reviewCount > 0 && reviewAverage != null ? (
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{reviewAverage.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{reviewCount}</Text>
            <Text style={styles.statLabel}>
              {reviewCount === 1 ? "Review" : "Reviews"}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.lg,
    marginBottom: space.md,
  },
  avatar: {
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  name: {
    marginTop: space.md,
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: "center",
    paddingHorizontal: space.lg,
  },
  stats: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.lg,
    width: "100%",
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.inkSoft,
  },
});
