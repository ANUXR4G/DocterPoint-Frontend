import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBadge } from "@/components/ui";
import { chartSummaryLines } from "@/lib/clinicalMasters";
import { bookingDoctorName, whenLabel, type BookingRow } from "@/lib/types";
import { colors, space } from "@/lib/theme";

/** Latest visit on the patient record: vitals, allergies, pain, prescription. */
export function VisitChartSummary({
  booking,
  onOpen,
}: {
  booking: BookingRow;
  onOpen: () => void;
}) {
  const lines = chartSummaryLines(booking.clinicalAssessment, booking.medicines);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.when} numberOfLines={2}>
          {[whenLabel(booking), bookingDoctorName(booking)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <StatusBadge status={booking.status} />
        <Pressable onPress={onOpen} hitSlop={8}>
          <Text style={styles.open}>Open</Text>
        </Pressable>
      </View>
      <Line label="Vitals" value={lines.vitals} />
      <Line label="Allergies" value={lines.allergies} />
      <Line label="Pain" value={lines.pain} />
      <Line label="Prescription" value={lines.prescription} />
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.line}>
      <Text style={styles.label}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 6,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  when: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.ink },
  open: { fontSize: 13, fontWeight: "700", color: colors.brand },
  line: { fontSize: 13, lineHeight: 18, color: colors.ink },
  label: { fontWeight: "700", color: colors.inkSoft },
});
