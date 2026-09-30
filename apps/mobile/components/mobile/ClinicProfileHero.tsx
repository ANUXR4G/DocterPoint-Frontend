import { Ionicons } from "@expo/vector-icons";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { colors, shadows, space } from "@/lib/theme";

type Props = {
  name: string;
  specialty: string;
  /** Clinic name / city line under the specialty. */
  detail?: string;
  photoUri?: string | null;
  stats: { label: string; value: string }[];
};

export function ClinicProfileHero({ name, specialty, detail, photoUri, stats }: Props) {
  return (
    <View style={styles.wrap}>
      <View>
        <ClinicAvatar
          name={name.replace(/^Dr\.?\s*/i, "")}
          uri={photoUri}
          size={112}
          radius={32}
          style={styles.avatar}
        />
        <View style={styles.verified}>
          <Ionicons name="checkmark-done" size={13} color={colors.white} />
        </View>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.specialty}>{specialty}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}

      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  avatar: {
    borderWidth: 4,
    borderColor: colors.white,
  },
  verified: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  name: {
    marginTop: space.lg,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  specialty: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: colors.brand,
    textAlign: "center",
  },
  detail: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "center",
    paddingHorizontal: space.lg,
  },
  stats: {
    marginTop: space.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    alignItems: "center",
    paddingHorizontal: space.xl,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    backgroundColor: colors.lineStrong,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.inkFaint,
  },
  statValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
});
