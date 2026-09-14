import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradientStub } from "@/components/ui/GradientStub";
import { ThinkingLoader } from "@/components/ThinkingLoader";
import { AnimatedView, PressableScale } from "@/lib/motion";
import { colors, radii, space, type } from "@/lib/theme";

export function Screen({
  children,
  style,
  ...rest
}: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const mark = size === "lg" ? 44 : size === "sm" ? 28 : 36;
  const text = size === "lg" ? 26 : size === "sm" ? 17 : 22;
  return (
    <View style={styles.brandRow}>
      <View
        style={[
          styles.brandMark,
          { width: mark, height: mark, borderRadius: mark * 0.36 },
        ]}
      >
        <Text style={[styles.brandMarkText, { fontSize: mark * 0.38 }]}>G</Text>
      </View>
      <Text style={[styles.brand, { fontSize: text }]}>GlucoGuide Doctor</Text>
    </View>
  );
}

export function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <AnimatedView from="up" style={{ marginBottom: space.xl }}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </AnimatedView>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, props.editable === false && styles.inputDisabled]}
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  tone = "brand",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "brand" | "ink" | "danger" | "ghost";
}) {
  const bg =
    tone === "ink"
      ? colors.navy
      : tone === "danger"
        ? colors.danger
        : tone === "ghost"
          ? "transparent"
          : colors.navy;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.btn,
        { backgroundColor: bg },
        tone === "ghost" && styles.btnGhost,
      ]}
    >
      {busy ? (
        <ThinkingLoader
          size={20}
          theme={tone === "ghost" ? "light" : "dark"}
        />
      ) : (
        <Text
          style={[styles.btnText, tone === "ghost" && { color: colors.ink }]}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={styles.btnSecondary}
    >
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </PressableScale>
  );
}

export function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text
              style={[
                styles.segmentText,
                active && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <AnimatedView from="fade" style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>◇</Text>
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </AnimatedView>
  );
}

export function Loading({ label = "Loading" }: { label?: string } = {}) {
  return <ThinkingLoader fullPage label={label} />;
}

export function ErrorText({ text }: { text: string }) {
  if (!text) return null;
  return <Text style={styles.error}>{text}</Text>;
}

export function HintText({ text }: { text: string }) {
  if (!text) return null;
  return <Text style={styles.hint}>{text}</Text>;
}

export function Atmosphere({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.atmosphere} pointerEvents="none">
      <View style={[styles.blob, styles.blobOne]} />
      <View style={[styles.blob, styles.blobTwo]} />
      <LinearGradientStub />
      {children}
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const tone =
    s === "COMPLETED"
      ? colors.ok
      : s === "CANCELED" || s === "CANCELLED" || s === "NO_SHOW"
        ? colors.danger
        : s === "IN_PROGRESS"
          ? colors.accent
          : s === "ACCEPTED" || s === "CONFIRMED"
            ? colors.brandDeep
            : s === "WAITING" || s === "CHECKED_IN"
              ? colors.brand
              : colors.inkSoft;
  const label =
    s === "WAITING" || s === "CHECKED_IN"
      ? "In waiting"
      : s === "IN_PROGRESS"
        ? "Appointment started"
        : s === "COMPLETED"
          ? "Appointment finished"
          : s === "ACCEPTED" || s === "CONFIRMED"
            ? "Accepted"
            : s === "SCHEDULED" ||
                s === "REQUESTED" ||
                s === "BOOKED"
              ? "Requested"
              : s === "NO_SHOW"
                ? "No-show"
                : s === "CANCELED" || s === "CANCELLED"
                  ? "Canceled"
                  : status.replace(/_/g, " ");
  return (
    <Text style={[styles.badge, { color: tone, borderColor: tone }]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    color: colors.white,
    fontWeight: "700",
  },
  brand: {
    fontWeight: "600",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  eyebrow: {
    ...type.overline,
    color: colors.inkFaint,
    marginBottom: 8,
  },
  title: {
    ...type.title,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    ...type.subtitle,
    color: colors.inkSoft,
  },
  sectionTitle: {
    marginTop: space.lg,
    marginBottom: space.sm,
    ...type.overline,
    color: colors.inkFaint,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    padding: space.lg,
    borderRadius: radii.xl,
  },
  label: {
    ...type.label,
    color: colors.inkSoft,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.ink,
    borderRadius: radii.md,
  },
  inputDisabled: {
    opacity: 0.7,
    backgroundColor: colors.sky50,
  },
  btn: {
    paddingVertical: 15,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  btnGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  btnSecondary: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.paperRaised,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.white,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.white,
  },
  segment: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.sky100,
    padding: 4,
    gap: 4,
    marginBottom: space.lg,
    borderRadius: radii.md,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.white,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.inkSoft,
  },
  segmentTextActive: {
    color: colors.ink,
    fontWeight: "600",
  },
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    padding: space.xl,
    alignItems: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    gap: space.sm,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyIconText: {
    fontSize: 18,
    color: colors.brand,
  },
  emptyText: {
    textAlign: "center",
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: space.md,
  },
  hint: {
    color: colors.brand,
    fontSize: 14,
    marginBottom: space.md,
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.4,
  },
  blobOne: {
    width: 260,
    height: 260,
    backgroundColor: colors.brandLight,
    top: -80,
    right: -60,
  },
  blobTwo: {
    width: 200,
    height: 200,
    backgroundColor: colors.sky100,
    bottom: 100,
    left: -60,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
});
