import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { forwardRef, type ReactNode } from "react";

export const enterUp = (delay = 0) =>
  FadeInUp.delay(delay).springify().damping(18).stiffness(160);

export const enterDown = (delay = 0) =>
  FadeInDown.delay(delay).springify().damping(18).stiffness(160);

export const enterFade = (delay = 0) => FadeIn.delay(delay).duration(320);

export const enterZoom = (delay = 0) =>
  ZoomIn.delay(delay).springify().damping(16).stiffness(180);

export function AnimatedView({
  children,
  style,
  delay = 0,
  from = "up",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  from?: "up" | "down" | "fade" | "zoom";
}) {
  const entering =
    from === "down"
      ? enterDown(delay)
      : from === "fade"
        ? enterFade(delay)
        : from === "zoom"
          ? enterZoom(delay)
          : enterUp(delay);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/** Soft press scale for cards and CTAs. */
export const PressableScale = forwardRef<
  React.ElementRef<typeof Pressable>,
  PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }
>(function PressableScale(
  { children, style, onPress, disabled, onPressIn, onPressOut, ...rest },
  ref,
) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
        onPressOut?.(e);
      }}
      onPress={onPress}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle, disabled ? { opacity: 0.45 } : null]}>
        {children}
      </Animated.View>
    </Pressable>
  );
});

export { Animated, withTiming, withSpring, runOnJS, useSharedValue, useAnimatedStyle };
