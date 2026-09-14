import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, shadows } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export const SPECIALTIES = [
  {
    id: "endocrinology",
    label: "Diabetes",
    icon: "water-outline" as IconName,
    query: "endocrinology",
  },
  {
    id: "general",
    label: "General",
    icon: "medkit-outline" as IconName,
    query: "general",
  },
  {
    id: "cardiology",
    label: "Heart",
    icon: "heart-outline" as IconName,
    query: "cardiology",
  },
  {
    id: "paediatrics",
    label: "Child",
    icon: "happy-outline" as IconName,
    query: "paediatric",
  },
] as const;

type Props = {
  onSelect: (query: string) => void;
  activeId?: string;
};

export function SpecialtyRow({ onSelect, activeId }: Props) {
  return (
    <View style={styles.row}>
      {SPECIALTIES.map((s) => {
        const active = activeId === s.query || activeId === s.id;
        return (
          <Pressable
            key={s.id}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => onSelect(s.query)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={s.label}
          >
            <View style={[styles.circle, active && styles.circleActive]}>
              <Ionicons
                name={s.icon}
                size={22}
                color={active ? colors.white : colors.ink}
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  item: {
    alignItems: "center",
    flex: 1,
  },
  itemPressed: {
    opacity: 0.72,
  },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  circleActive: {
    backgroundColor: colors.navy,
  },
  label: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "500",
    color: colors.inkSoft,
    letterSpacing: -0.1,
  },
  labelActive: {
    color: colors.ink,
    fontWeight: "600",
  },
});
