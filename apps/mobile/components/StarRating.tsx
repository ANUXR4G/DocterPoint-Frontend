import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function StarRating({
  average,
  count,
  compact,
}: {
  average: number | null;
  count: number;
  compact?: boolean;
}) {
  if (!count || average == null) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.star, compact && styles.starSm]}>★</Text>
      <Text style={[styles.avg, compact && styles.avgSm]}>
        {average.toFixed(1)}
      </Text>
      {!compact ? <Text style={styles.count}>({count})</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  star: { color: "#b45309", fontSize: 14, fontWeight: "700" },
  starSm: { fontSize: 12 },
  avg: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  avgSm: { fontSize: 11 },
  count: { color: colors.inkSoft, fontSize: 12 },
});
