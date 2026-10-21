import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { ClinicAvatar } from "@/components/mobile/ClinicAvatar";
import { useCareTheme } from "@/lib/careTheme";
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
  const { theme } = useCareTheme();
  return (
    <View style={styles.wrap}>
      <View>
        <ClinicAvatar
          name={name.replace(/^Dr\.?\s*/i, "")}
          uri={photoUri}
          size={112}
          radius={32}
          backgroundColor={theme.visit}
          textColor={theme.visitInk}
          style={[styles.avatar, { borderColor: theme.card }]}
        />
        <View style={[styles.verified, { backgroundColor: theme.taskInk, borderColor: theme.card }]}>
          <SvgIcon name="checkDone" size={13} color={colors.white} />
        </View>
      </View>
      <Text style={[styles.name, { color: theme.ink }]}>{name}</Text>
      <Text style={[styles.specialty, { color: theme.visitInk }]}>{specialty}</Text>
      {detail ? <Text style={[styles.detail, { color: theme.muted }]}>{detail}</Text> : null}

      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.line }]} /> : null}
              <View style={styles.stat}>
                <Text style={[styles.statLabel, { color: theme.muted }]}>{s.label}</Text>
                <Text style={[styles.statValue, { color: theme.ink }]}>{s.value}</Text>
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
  },
  verified: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.soft,
  },
  name: {
    marginTop: space.lg,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  specialty: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    marginTop: 4,
    fontSize: 13,
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
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
  },
});
