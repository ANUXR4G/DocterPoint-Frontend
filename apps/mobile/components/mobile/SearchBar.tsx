import { StyleSheet, TextInput, View } from "react-native";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { useCareTheme } from "@/lib/careTheme";
import { colors } from "@/lib/theme";

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
  placeholder = "Search doctor, specialty…",
  onSubmit,
  dark = false,
}: Props) {
  const { theme } = useCareTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.card }, dark && styles.wrapDark]}>
      <View style={styles.icon}>
        <SvgIcon
          name="search"
          size={18}
          color={dark ? "rgba(255,255,255,0.5)" : theme.muted}
        />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? "rgba(255,255,255,0.4)" : theme.muted}
        style={[styles.input, { color: theme.ink }, dark && styles.inputDark]}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
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
