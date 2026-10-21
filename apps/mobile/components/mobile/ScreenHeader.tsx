import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgIcon } from "@/components/icons/SvgIcon";
import { useCareTheme } from "@/lib/careTheme";
import { PressableScale } from "@/lib/motion";
import { space } from "@/lib/theme";

type Props = {
  title: string;
  /** Round back button on the left (detail screens). */
  back?: boolean;
  /** Title sits beside the back button instead of centred. */
  alignLeft?: boolean;
};

const BTN = 42;

export function ScreenHeader({ title, back = false, alignLeft = false }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useCareTheme();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      {back ? (
        <PressableScale
          style={[styles.backBtn, { backgroundColor: theme.card }]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/home"))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <SvgIcon name="chevronLeft" size={20} color={theme.ink} />
        </PressableScale>
      ) : null}
      <Text
        style={[
          styles.title,
          { color: theme.ink },
          alignLeft || !back ? styles.titleLeft : styles.titleCenter,
          back && alignLeft && { marginLeft: space.lg },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {back && !alignLeft ? <View style={{ width: BTN }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  backBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  titleCenter: {
    textAlign: "center",
    fontSize: 19,
  },
  titleLeft: {
    textAlign: "left",
  },
});
