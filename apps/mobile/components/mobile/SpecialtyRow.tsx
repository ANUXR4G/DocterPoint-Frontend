import { ScrollView, StyleSheet, Text } from "react-native";
import { PressableScale } from "@/lib/motion";
import { colors, radii, shadows, space } from "@/lib/theme";

export const SPECIALTIES = [
  { id: "endocrinology", label: "Diabetes", query: "endocrinology" },
  { id: "general", label: "General", query: "general" },
  { id: "cardiology", label: "Cardiology", query: "cardiology" },
  { id: "paediatrics", label: "Paediatrics", query: "paediatric" },
] as const;

type Props = {
  /** Selected specialty query; undefined means "All specialties". */
  active?: string;
  onSelect: (query: string | undefined) => void;
  /** Horizontal padding so the first pill lines up with page content. */
  inset?: number;
};

/** Horizontal specialty filter pills. */
export function SpecialtyChips({ active, onSelect, inset = space.xl }: Props) {
  const items: { key: string; label: string; query?: string }[] = [
    { key: "all", label: "All specialties" },
    ...SPECIALTIES.map((s) => ({ key: s.id, label: s.label, query: s.query })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
      style={{ marginHorizontal: -inset }}
    >
      {items.map((s) => {
        const selected = (s.query ?? undefined) === (active || undefined);
        return (
          <PressableScale
            key={s.key}
            style={[styles.pill, selected && styles.pillActive]}
            onPress={() => onSelect(s.query)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={s.label}
          >
            <Text style={[styles.label, selected && styles.labelActive]}>{s.label}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
    paddingVertical: 6,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  pillActive: {
    backgroundColor: colors.brand,
    ...shadows.brand,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.inkSoft,
  },
  labelActive: {
    color: colors.white,
  },
});
