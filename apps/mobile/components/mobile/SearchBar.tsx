import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TextInput, View } from "react-native";
import { colors, radii, space } from "@/lib/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  /** Lighter field for use on dark hero surfaces. */
  dark?: boolean;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search doctor or clinic",
  onSubmit,
  dark = false,
}: Props) {
  return (
    <View style={[styles.wrap, dark && styles.wrapDark]}>
      <Ionicons
        name="search"
        size={18}
        color={dark ? "rgba(255,255,255,0.5)" : colors.inkFaint}
        style={styles.icon}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? "rgba(255,255,255,0.4)" : colors.inkFaint}
        style={[styles.input, dark && styles.inputDark]}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: space.lg,
    paddingVertical: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  wrapDark: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
    color: colors.ink,
    padding: 0,
    letterSpacing: -0.15,
  },
  inputDark: {
    color: colors.white,
  },
});
