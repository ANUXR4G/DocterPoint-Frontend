import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import { PressableScale } from "@/lib/motion";
import { colors, radii, shadows, space } from "@/lib/theme";

type Specialty = { id: string; name: string; slug: string };

type Props = {
  /** Selected specialty name; undefined means all specialties. */
  active?: string;
  onSelect: (name: string | undefined) => void;
  /** Horizontal padding so the first pill lines up with page content. */
  inset?: number;
};

/** Horizontal specialty pills from the shared catalog (only specialties that have a doctor). */
export function SpecialtyChips({ active, onSelect, inset = space.xl }: Props) {
  const scroller = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
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

  function nudge(dir: -1 | 1) {
    const next = Math.max(0, offset.current + dir * 180);
    scroller.current?.scrollTo({ x: next, animated: true });
  }

  const pills: { key: string; label: string; name?: string }[] = [
    { key: "all", label: "All" },
    ...items.map((s) => ({ key: s.id, label: s.name, name: s.name })),
  ];

  return (
    <View style={[styles.wrap, { marginHorizontal: -inset }]}>
      <PressableScale
        style={[styles.arrow, !canLeft && styles.arrowOff]}
        onPress={() => nudge(-1)}
        disabled={!canLeft}
        accessibilityRole="button"
        accessibilityLabel="Previous specialties"
      >
        <Text style={styles.arrowLabel}>‹</Text>
      </PressableScale>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingHorizontal: 36 }]}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const width = e.nativeEvent.layoutMeasurement.width;
          const total = e.nativeEvent.contentSize.width;
          offset.current = x;
          setCanLeft(x > 4);
          setCanRight(x + width < total - 4);
        }}
        scrollEventThrottle={16}
        onContentSizeChange={(w) => {
          setCanRight(w > 280);
        }}
      >
        {pills.map((s) => {
          const selected = (s.name ?? undefined) === (active || undefined);
          return (
            <PressableScale
              key={s.key}
              style={[styles.pill, selected && styles.pillActive]}
              onPress={() => onSelect(s.name)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={s.label}
            >
              <Text style={[styles.label, selected && styles.labelActive]}>{s.label}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <PressableScale
        style={[styles.arrow, styles.arrowRight, !canRight && styles.arrowOff]}
        onPress={() => nudge(1)}
        disabled={!canRight}
        accessibilityRole="button"
        accessibilityLabel="Next specialties"
      >
        <Text style={styles.arrowLabel}>›</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    justifyContent: "center",
  },
  row: {
    gap: 10,
    paddingVertical: 6,
  },
  arrow: {
    position: "absolute",
    left: 0,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  arrowRight: {
    left: undefined,
    right: 0,
  },
  arrowOff: {
    opacity: 0.35,
  },
  arrowLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    marginTop: -2,
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
