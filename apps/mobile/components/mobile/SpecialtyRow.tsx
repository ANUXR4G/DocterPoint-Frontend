import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import { useCareTheme } from "@/lib/careTheme";
import { PressableScale } from "@/lib/motion";

type Specialty = { id: string; name: string; slug: string };

type Props = {
  /** Selected specialty name; undefined means all specialties. */
  active?: string;
  onSelect: (name: string | undefined) => void;
};

/** Horizontal specialty pills from the shared catalog (only specialties that have a doctor). */
export function SpecialtyChips({ active, onSelect }: Props) {
  const { theme } = useCareTheme();
  const [items, setItems] = useState<Specialty[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api<Specialty[]>("/procto/specialties?has_doctors=true").then((res) => {
      if (cancelled || res.status !== "successful" || !Array.isArray(res.data)) return;
      setItems(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pills: { key: string; label: string; name?: string }[] = [
    { key: "all", label: "All" },
    ...items.map((s) => ({ key: s.id, label: s.name, name: s.name })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {pills.map((s) => {
        const selected = (s.name ?? undefined) === (active || undefined);
        return (
          <PressableScale
            key={s.key}
            style={[styles.pill, { backgroundColor: selected ? theme.ink : theme.card }]}
            onPress={() => onSelect(s.name)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={s.label}
          >
            <Text style={[styles.label, { color: selected ? "#fff" : theme.ink }]}>{s.label}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingBottom: 16,
    paddingRight: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 64,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
});
