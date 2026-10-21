import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COUNTRY_DIALS,
  countryLabel,
  type CountryDial,
} from "@/lib/countries";
import { useCareTheme } from "@/lib/careTheme";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  label?: string;
  country: CountryDial;
  onCountryChange: (c: CountryDial) => void;
  national: string;
  onNationalChange: (v: string) => void;
  placeholder?: string;
};

export function CountryPhoneField({
  label = "Mobile number",
  country,
  onCountryChange,
  national,
  onNationalChange,
  placeholder = "Mobile number",
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return COUNTRY_DIALS;
    return COUNTRY_DIALS.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.dial.includes(needle.replace(/\D/g, "")) ||
        c.iso.toLowerCase().includes(needle) ||
        `+${c.dial}`.includes(needle),
    );
  }, [q]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            setQ("");
            setOpen(true);
          }}
          style={[styles.countryBtn, { backgroundColor: theme.paper, borderColor: theme.line }]}
          accessibilityRole="button"
          accessibilityLabel={`Country ${countryLabel(country)}`}
        >
          <Text style={[styles.countryCode, { color: theme.ink }]}>+{country.dial}</Text>
          <Text style={[styles.chevron, { color: theme.muted }]}>▾</Text>
        </Pressable>
        <TextInput
          value={national}
          onChangeText={onNationalChange}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.ink, backgroundColor: theme.paper, borderColor: theme.line }]}
        />
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={[
            styles.modal,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Country / region</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search country or code"
            placeholderTextColor={colors.inkFaint}
            style={styles.search}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.iso}-${item.dial}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.iso === country.iso && item.dial === country.dial;
              return (
                <Pressable
                  onPress={() => {
                    onCountryChange(item);
                    setOpen(false);
                  }}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.optionName}>{item.name}</Text>
                    <Text style={styles.optionIso}>{item.iso}</Text>
                  </View>
                  <Text style={styles.optionDial}>+{item.dial}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No countries match.</Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countryBtn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: "700",
  },
  chevron: {
    fontSize: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 0,
    textAlignVertical: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: space.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  done: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.brand,
  },
  search: {
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    marginBottom: space.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    marginBottom: 4,
    backgroundColor: colors.white,
  },
  optionActive: {
    backgroundColor: colors.brandLight,
  },
  optionName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  optionIso: {
    marginTop: 2,
    fontSize: 12,
    color: colors.inkFaint,
  },
  optionDial: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.brand,
  },
  empty: {
    textAlign: "center",
    marginTop: space.xl,
    color: colors.inkFaint,
  },
});
